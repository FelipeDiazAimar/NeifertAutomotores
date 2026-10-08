/*
 * Archivos: fotos, videos, audios, stickers, documentos y fotos de perfil.
 *
 * Con WA_R2_BUCKET van a Cloudflare R2 (un bucket privado); si no, al disco (DATA_DIR).
 * Las claves son las mismas rutas en los dos lados, así pasar del disco a R2 es copiar:
 *
 *   media/<carpeta>/<id>.<ext>  archivos de los mensajes; la carpeta lleva el nombre del
 *                               contacto y su número (ver claveMedia en almacen.js)
 *   fotos/<chat>.jpg            fotos de perfil
 *
 * Cada línea (número de WhatsApp) tiene lo suyo aparte: estas claves "lógicas" se guardan
 * bajo lineas/<número>/ (en R2 y en el disco). El resto del servidor no se entera: usa
 * media/…, fotos/…, respaldo/… y acá se les agrega el prefijo. Lo único común a todas las
 * líneas es app/ (los paquetes de actualización del servidor).
 *
 * El navegador nunca habla con R2: el servidor trae cada archivo y lo entrega solo a
 * quien entró desde el CRM, así el bucket puede (y tiene que) quedar cerrado.
 * Un archivo que todavía está en el disco se sirve desde ahí aunque R2 esté activo:
 * lo que se guardó antes de configurar R2 se sigue viendo hasta subirlo (npm run subir-r2).
 */
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { ARCHIVOS_EN_R2, CLAVE_LINEA, DATA_DIR, R2 } from './config.js'
import { mimeDe } from './tipos.js'
import * as cuota from './cuota.js'

const cliente = ARCHIVOS_EN_R2
  ? new S3Client({
      endpoint: R2.endpoint,
      region: 'auto',
      credentials: { accessKeyId: R2.accessKeyId, secretAccessKey: R2.secretAccessKey },
    })
  : null

export const DONDE = ARCHIVOS_EN_R2 ? `Cloudflare R2 (bucket ${R2.bucket})` : DATA_DIR

const PREFIJO_LINEA = `lineas/${CLAVE_LINEA}/`
const COMUN = /^app\//
/** Clave lógica (media/…) → clave real en R2 y en el disco (lineas/<número>/media/…). */
export const fisica = (clave) => (COMUN.test(clave) ? clave : PREFIJO_LINEA + clave)
const logica = (clave) => (clave.startsWith(PREFIJO_LINEA) ? clave.slice(PREFIJO_LINEA.length) : clave)

const enDiscoFisico = (clave) => path.join(DATA_DIR, ...clave.split('/'))
/** Ruta en el disco de una clave (media/…, fotos/…). */
export const enDisco = (clave) => enDiscoFisico(fisica(clave))

const noEncontrado = (texto) => Object.assign(new Error(texto), { status: 404 })

export async function guardar(clave, buffer, mime) {
  if (cliente) {
    // Tope del plan gratuito de R2 (ver cuota.js): corta antes de subir.
    cuota.permitir(clave, buffer.length)
    await cliente.send(
      new PutObjectCommand({ Bucket: R2.bucket, Key: fisica(clave), Body: buffer, ContentType: mime || 'application/octet-stream' }),
    )
    cuota.sumar(buffer.length)
    return
  }
  const ruta = enDisco(clave)
  fs.mkdirSync(path.dirname(ruta), { recursive: true })
  fs.writeFileSync(ruta, buffer)
}

/** Contenido completo de un archivo (del disco si está ahí, si no de R2). null si no existe. */
export async function leer(clave) {
  const local = enDisco(clave)
  if (fs.existsSync(local)) return fs.readFileSync(local)
  if (!cliente) return null
  try {
    const obj = await cliente.send(new GetObjectCommand({ Bucket: R2.bucket, Key: fisica(clave) }))
    return Buffer.from(await obj.Body.transformToByteArray())
  } catch (err) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null
    throw err
  }
}

/** Borra un archivo (de R2 y del disco, esté donde esté). */
export async function borrar(clave) {
  fs.rmSync(enDisco(clave), { force: true })
  if (cliente) await cliente.send(new DeleteObjectCommand({ Bucket: R2.bucket, Key: fisica(clave) }))
}

/**
 * Manda el archivo al navegador. Respeta los pedidos parciales (Range), que son los que
 * usan los videos y audios para adelantar sin bajar todo.
 */
export async function servir(req, res, clave, { mime, nombre, descargar = false, cache = 'private, max-age=86400', faltante = 'El archivo no está' } = {}) {
  if (descargar && nombre) res.attachment(nombre)
  res.set('Cache-Control', cache)

  const local = enDisco(clave)
  if (fs.existsSync(local)) {
    if (mime) res.type(mime.split(';')[0])
    return res.sendFile(local)
  }
  if (!cliente) throw noEncontrado(faltante)

  let obj
  try {
    obj = await cliente.send(new GetObjectCommand({ Bucket: R2.bucket, Key: fisica(clave), Range: req.headers.range }))
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode
    if (err?.name === 'NoSuchKey' || status === 404) throw noEncontrado(faltante)
    if (status === 416) throw Object.assign(new Error('Rango inválido'), { status: 416 })
    throw Object.assign(new Error(`No se pudo traer el archivo de R2: ${err.message}`), { status: 502 })
  }
  res.status(obj.ContentRange ? 206 : 200)
  res.set({
    'Content-Type': (mime || obj.ContentType || mimeDe(clave)).split(';')[0],
    'Accept-Ranges': 'bytes',
    ...(obj.ContentLength != null ? { 'Content-Length': String(obj.ContentLength) } : {}),
    ...(obj.ContentRange ? { 'Content-Range': obj.ContentRange } : {}),
    ...(obj.ETag ? { ETag: obj.ETag } : {}),
  })
  // Si el navegador corta (cerró el chat, adelantó el video), el error es esperable.
  await pipeline(obj.Body, res).catch(() => {})
}

/** Todas las claves reales de R2 bajo un prefijo real, con su tamaño. */
async function listarR2(prefijo) {
  const todas = []
  let token
  do {
    const r = await cliente.send(
      new ListObjectsV2Command({ Bucket: R2.bucket, Prefix: prefijo, ContinuationToken: token }),
    )
    for (const o of r.Contents || []) todas.push({ clave: o.Key, tamano: o.Size || 0, fecha: o.LastModified?.getTime() || 0 })
    token = r.IsTruncated ? r.NextContinuationToken : undefined
  } while (token)
  return todas
}

function listarDiscoFisico(prefijo) {
  const todas = []
  const recorrer = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) recorrer(p)
      else {
        const st = fs.statSync(p)
        todas.push({ clave: path.relative(DATA_DIR, p).split(path.sep).join('/'), tamano: st.size, fecha: st.mtimeMs })
      }
    }
  }
  recorrer(enDiscoFisico(prefijo))
  return todas
}

/** Mide lo que ocupa el bucket entero, todas las líneas juntas (para el tope de espacio). */
export const medirR2 = () => cuota.medir(() => (cliente ? listarR2('') : Promise.resolve([])))

/**
 * Archivos de esta línea bajo un prefijo lógico (media/ o fotos/), en R2 y en el disco, con
 * su clave lógica. Si una clave está en los dos lados se cuenta una sola vez.
 */
export async function listarArchivos(prefijo) {
  const porClave = new Map(listarDiscoFisico(fisica(prefijo)).map((a) => [a.clave, a]))
  if (cliente) for (const a of await listarR2(fisica(prefijo))) porClave.set(a.clave, a)
  return [...porClave.values()].map((a) => ({ ...a, clave: logica(a.clave) }))
}

/**
 * CopySource de S3: "bucket/clave" con cada tramo de la clave codificado y las barras tal
 * cual. Codificar también las barras (%2F) funciona en R2 de casualidad, pero no es lo que
 * pide la especificación.
 */
export const fuenteCopia = (clave) => `${R2.bucket}/${clave.split('/').map(encodeURIComponent).join('/')}`

/**
 * Mueve todo lo de un prefijo a otro (por ejemplo, cuando dos chats se unen en uno). En R2
 * no hay "mover": primero se copia TODO, se verifica que cada copia esté con el mismo
 * tamaño y recién ahí se borran los originales. Si algo falla en el medio, los originales
 * quedan y se puede reintentar (las copias ya hechas se pisan sin problema).
 */
export const moverPrefijo = (desde, hacia) => moverCrudo(fisica(desde), fisica(hacia))

/** Lo mismo con prefijos reales (lo usa la mudanza de los datos viejos a lineas/<número>/). */
export async function moverCrudo(desde, hacia) {
  const viejo = enDiscoFisico(desde)
  if (fs.existsSync(viejo)) {
    const nuevo = enDiscoFisico(hacia)
    fs.mkdirSync(nuevo, { recursive: true })
    for (const f of fs.readdirSync(viejo)) fs.renameSync(path.join(viejo, f), path.join(nuevo, f))
    fs.rmSync(viejo, { recursive: true, force: true })
  }
  if (!cliente) return
  const originales = await listarR2(`${desde}/`)
  if (!originales.length) return
  const destinoDe = (clave) => `${hacia}/${clave.slice(desde.length + 1)}`
  for (const { clave } of originales) {
    await cliente.send(new CopyObjectCommand({ Bucket: R2.bucket, Key: destinoDe(clave), CopySource: fuenteCopia(clave) }))
  }
  const copiados = new Map((await listarR2(`${hacia}/`)).map((a) => [a.clave, a.tamano]))
  const faltan = originales.filter((o) => copiados.get(destinoDe(o.clave)) !== o.tamano)
  if (faltan.length) throw new Error(`${faltan.length} archivos no se copiaron bien a ${hacia}: los originales quedan en ${desde}`)
  for (const { clave } of originales) await cliente.send(new DeleteObjectCommand({ Bucket: R2.bucket, Key: clave }))
}
