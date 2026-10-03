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
import { ARCHIVOS_EN_R2, DATA_DIR, R2 } from './config.js'

const cliente = ARCHIVOS_EN_R2
  ? new S3Client({
      endpoint: R2.endpoint,
      region: 'auto',
      credentials: { accessKeyId: R2.accessKeyId, secretAccessKey: R2.secretAccessKey },
    })
  : null

export const DONDE = ARCHIVOS_EN_R2 ? `Cloudflare R2 (bucket ${R2.bucket})` : DATA_DIR

/** Ruta en el disco de una clave (media/…, fotos/…). */
export const enDisco = (clave) => path.join(DATA_DIR, ...clave.split('/'))

const noEncontrado = (texto) => Object.assign(new Error(texto), { status: 404 })

export async function guardar(clave, buffer, mime) {
  if (cliente) {
    await cliente.send(
      new PutObjectCommand({ Bucket: R2.bucket, Key: clave, Body: buffer, ContentType: mime || 'application/octet-stream' }),
    )
    return
  }
  const ruta = enDisco(clave)
  fs.mkdirSync(path.dirname(ruta), { recursive: true })
  fs.writeFileSync(ruta, buffer)
}

/** Borra un archivo (de R2 y del disco, esté donde esté). */
export async function borrar(clave) {
  fs.rmSync(enDisco(clave), { force: true })
  if (cliente) await cliente.send(new DeleteObjectCommand({ Bucket: R2.bucket, Key: clave }))
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
    obj = await cliente.send(new GetObjectCommand({ Bucket: R2.bucket, Key: clave, Range: req.headers.range }))
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode
    if (err?.name === 'NoSuchKey' || status === 404) throw noEncontrado(faltante)
    if (status === 416) throw Object.assign(new Error('Rango inválido'), { status: 416 })
    throw Object.assign(new Error(`No se pudo traer el archivo de R2: ${err.message}`), { status: 502 })
  }
  res.status(obj.ContentRange ? 206 : 200)
  res.set({
    'Content-Type': (mime || obj.ContentType || 'application/octet-stream').split(';')[0],
    'Accept-Ranges': 'bytes',
    ...(obj.ContentLength != null ? { 'Content-Length': String(obj.ContentLength) } : {}),
    ...(obj.ContentRange ? { 'Content-Range': obj.ContentRange } : {}),
    ...(obj.ETag ? { ETag: obj.ETag } : {}),
  })
  // Si el navegador corta (cerró el chat, adelantó el video), el error es esperable.
  await pipeline(obj.Body, res).catch(() => {})
}

/** Todas las claves bajo un prefijo, con su tamaño. */
async function listar(prefijo) {
  const todas = []
  let token
  do {
    const r = await cliente.send(
      new ListObjectsV2Command({ Bucket: R2.bucket, Prefix: prefijo, ContinuationToken: token }),
    )
    for (const o of r.Contents || []) todas.push({ clave: o.Key, tamano: o.Size || 0 })
    token = r.IsTruncated ? r.NextContinuationToken : undefined
  } while (token)
  return todas
}

function listarDisco(prefijo) {
  const todas = []
  const recorrer = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) recorrer(p)
      else todas.push({ clave: path.relative(DATA_DIR, p).split(path.sep).join('/'), tamano: fs.statSync(p).size })
    }
  }
  recorrer(enDisco(prefijo))
  return todas
}

/**
 * Archivos bajo un prefijo (media/ o fotos/), en R2 y en el disco. Si una clave está en
 * los dos lados se cuenta una sola vez.
 */
export async function listarArchivos(prefijo) {
  const porClave = new Map(listarDisco(prefijo).map((a) => [a.clave, a]))
  if (cliente) for (const a of await listar(prefijo)) porClave.set(a.clave, a)
  return [...porClave.values()]
}

/** Mueve todo lo de un prefijo a otro (por ejemplo, cuando dos chats se unen en uno). */
export async function moverPrefijo(desde, hacia) {
  const viejo = enDisco(desde)
  if (fs.existsSync(viejo)) {
    const nuevo = enDisco(hacia)
    fs.mkdirSync(nuevo, { recursive: true })
    for (const f of fs.readdirSync(viejo)) fs.renameSync(path.join(viejo, f), path.join(nuevo, f))
    fs.rmSync(viejo, { recursive: true, force: true })
  }
  if (!cliente) return
  for (const { clave } of await listar(`${desde}/`)) {
    const destino = `${hacia}/${clave.slice(desde.length + 1)}`
    await cliente.send(
      new CopyObjectCommand({ Bucket: R2.bucket, Key: destino, CopySource: `${R2.bucket}/${encodeURIComponent(clave)}` }),
    )
    await cliente.send(new DeleteObjectCommand({ Bucket: R2.bucket, Key: clave }))
  }
}
