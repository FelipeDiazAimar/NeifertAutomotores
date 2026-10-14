/*
 * Cargar un respaldo de chats (.zip o .rar) y sumar al historial lo que falte.
 *
 * Entiende:
 *   - la exportación de este sistema ("Exportar" con o sin archivos): una carpeta por chat
 *     ("5493564111111 - Juan Pérez/Chat de WhatsApp.txt" + fotos, audios, documentos);
 *   - la exportación del celular ("Exportar chat"): Android ("Chat de WhatsApp con Juan.txt"
 *     + "IMG-…jpg (archivo adjunto)") e iPhone ("_chat.txt" + "<adjunto: …>").
 *
 * No pisa nada: un mensaje que ya está guardado (mismo minuto, mismo texto, mismo lado) no
 * se vuelve a cargar, y cargar dos veces el mismo respaldo no duplica (cada mensaje
 * importado tiene un id fijo). Lo anterior a la ventana de días (WA_VENTANA_DIAS) no se
 * carga: la limpieza diaria lo borraría igual. Un grupo se reconoce solo por su nombre (la
 * exportación no trae su id): si no hay un grupo guardado con ese nombre, se saltea.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { createRequire } from 'node:module'
import { VENTANA_DIAS } from './config.js'
import { agregarMensaje, existeChat, guardarMedia, listarChats, listarMensajes, upsertChat } from './almacen.js'

/* ---------------- Leer el .zip / .rar ---------------- */

const MAX32 = 0xffffffff

/** Lo de adentro de un .zip, sin descomprimir todavía: [{ ruta, tamano, leer() }]. */
export function entradasZip(archivo) {
  const fd = fs.openSync(archivo, 'r')
  const tamano = fs.fstatSync(fd).size
  const leerEn = (pos, largo) => {
    const b = Buffer.alloc(largo)
    fs.readSync(fd, b, 0, largo, pos)
    return b
  }
  // El final del índice está en los últimos 64 KB (22 bytes + comentario).
  const cola = leerEn(Math.max(0, tamano - 65558), Math.min(tamano, 65558))
  const fin = cola.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (fin < 0) {
    fs.closeSync(fd)
    throw new Error('El archivo no es un .zip válido')
  }
  let cantidad = cola.readUInt16LE(fin + 10)
  let inicio = cola.readUInt32LE(fin + 16)
  // ZIP64 (más de 4 GB o de 65.535 archivos): el índice real está en otro registro.
  const loc = cola.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]), fin)
  if (loc >= 0 && (inicio === MAX32 || cantidad === 0xffff)) {
    const reg = leerEn(Number(cola.readBigUInt64LE(loc + 8)), 56)
    cantidad = Number(reg.readBigUInt64LE(32))
    inicio = Number(reg.readBigUInt64LE(48))
  }
  const entradas = []
  let p = inicio
  for (let i = 0; i < cantidad; i++) {
    const cab = leerEn(p, 46)
    if (cab.readUInt32LE(0) !== 0x02014b50) break
    const metodo = cab.readUInt16LE(10)
    let comprimido = cab.readUInt32LE(20)
    let real = cab.readUInt32LE(24)
    const largoNombre = cab.readUInt16LE(28)
    const largoExtra = cab.readUInt16LE(30)
    const largoComentario = cab.readUInt16LE(32)
    let local = cab.readUInt32LE(42)
    const resto = leerEn(p + 46, largoNombre + largoExtra)
    const utf8 = (cab.readUInt16LE(8) & 0x0800) !== 0
    const ruta = resto.subarray(0, largoNombre).toString(utf8 ? 'utf8' : 'latin1')
    // Campo extra ZIP64: los valores que no entraron en 32 bits, en este orden.
    const extra = resto.subarray(largoNombre)
    for (let e = 0; e + 4 <= extra.length; ) {
      const id = extra.readUInt16LE(e)
      const largo = extra.readUInt16LE(e + 2)
      if (id === 0x0001) {
        let q = e + 4
        if (real === MAX32) (real = Number(extra.readBigUInt64LE(q))), (q += 8)
        if (comprimido === MAX32) (comprimido = Number(extra.readBigUInt64LE(q))), (q += 8)
        if (local === MAX32) local = Number(extra.readBigUInt64LE(q))
      }
      e += 4 + largo
    }
    p += 46 + largoNombre + largoExtra + largoComentario
    if (ruta.endsWith('/')) continue
    const datosEn = local
    entradas.push({
      ruta,
      tamano: real,
      leer: () => {
        const cabLocal = leerEn(datosEn, 30)
        const desde = datosEn + 30 + cabLocal.readUInt16LE(26) + cabLocal.readUInt16LE(28)
        const datos = leerEn(desde, comprimido)
        if (metodo === 0) return datos
        if (metodo === 8) return zlib.inflateRawSync(datos)
        throw new Error(`${ruta}: compresión no soportada (${metodo})`)
      },
    })
  }
  entradas.cerrar = () => fs.closeSync(fd)
  return entradas
}

/** Un .rar se descomprime en `carpeta` y se lee de ahí. */
export async function entradasRar(archivo, carpeta) {
  const { createExtractorFromFile } = createRequire(import.meta.url)('node-unrar-js')
  fs.mkdirSync(carpeta, { recursive: true })
  try {
    const extractor = await createExtractorFromFile({
      filepath: archivo,
      targetPath: carpeta,
      // Ningún archivo puede quedar fuera de la carpeta ("../" o rutas absolutas).
      filenameTransform: (nombre) => rutaSegura(nombre) || '_',
    })
    ;[...extractor.extract().files]
  } catch (err) {
    const motivo = err?.reason || err?.message || ''
    throw new Error(/PASSWORD/i.test(motivo) ? 'El .rar tiene contraseña: guardalo sin contraseña o como .zip' : `No se pudo abrir el .rar (¿está dañado o incompleto?) ${motivo}`.trim(), { cause: err })
  }
  const entradas = []
  const recorrer = (dir) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, d.name)
      if (d.isDirectory()) recorrer(completo)
      else entradas.push({ ruta: path.relative(carpeta, completo).split(path.sep).join('/'), tamano: fs.statSync(completo).size, leer: () => fs.readFileSync(completo) })
    }
  }
  recorrer(carpeta)
  entradas.cerrar = () => {}
  return entradas
}

const rutaSegura = (nombre) =>
  String(nombre)
    .replace(/\\/g, '/')
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..' && !/^[a-z]:$/i.test(p))
    .join('/')

/* ---------------- Interpretar el texto del chat ---------------- */

const INVISIBLES = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g
const ESPACIOS_RAROS = /[\u00a0\u202f]/g
const FECHA = String.raw`(\d{1,2})/(\d{1,2})/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap])\.?\s?m\.?)?`
// Android y este sistema: "06/10/2026, 14:05 - Autor: texto". iPhone: "[6/10/26, 14:05:33] Autor: texto".
const LINEA_ANDROID = new RegExp(`^${FECHA}\\s*-\\s(.*)$`, 'i')
const LINEA_IPHONE = new RegExp(`^\\[${FECHA}\\]\\s(.*)$`, 'i')

function fechaDe([, d, m, a, h, min, s, ampm]) {
  let hora = Number(h)
  if (ampm) hora = (hora % 12) + (/p/i.test(ampm) ? 12 : 0)
  const anio = a.length === 2 ? 2000 + Number(a) : Number(a)
  // La hora del texto es la de la PC (Argentina): fecha local.
  return Math.floor(new Date(anio, Number(m) - 1, Number(d), hora, Number(min), Number(s || 0)).getTime() / 1000)
}

/**
 * El texto de un chat exportado → { titulo: { nombre, telefono } | null, mensajes }.
 * Cada mensaje: { ts, autor, cuerpo } o { ts, sistema: true, cuerpo }. Las líneas sin fecha
 * son la continuación del mensaje anterior (mensajes de varios renglones).
 */
export function leerChatTxt(texto) {
  const lineas = String(texto).replace(INVISIBLES, '').replace(ESPACIOS_RAROS, ' ').split(/\r?\n/)
  let titulo = null
  const mensajes = []
  for (const linea of lineas) {
    const m = LINEA_ANDROID.exec(linea) || LINEA_IPHONE.exec(linea)
    if (m) {
      const cuerpo = m[8]
      const i = cuerpo.indexOf(': ')
      mensajes.push(i > 0 ? { ts: fechaDe(m), autor: cuerpo.slice(0, i).trim(), cuerpo: cuerpo.slice(i + 2) } : { ts: fechaDe(m), sistema: true, cuerpo })
      continue
    }
    if (mensajes.length) {
      mensajes.at(-1).cuerpo += `\n${linea}`
      continue
    }
    const t = /^Chat de WhatsApp con (.+?)(?: \((\+?[\d\s-]+)\))?$/.exec(linea.trim())
    if (t) titulo = { nombre: t[1].trim(), telefono: t[2] ? t[2].replace(/\D/g, '') : null }
  }
  for (const m of mensajes) m.cuerpo = m.cuerpo.replace(/\s+$/, '')
  return { titulo, mensajes }
}

const POR_ROTULO = { Foto: 'imagen', Video: 'video', GIF: 'gif', 'Nota de voz': 'nota_voz', Audio: 'audio', Documento: 'documento', Sticker: 'sticker' }
const MIMES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', '3gp': 'video/3gpp', mov: 'video/quicktime',
  opus: 'audio/ogg; codecs=opus', ogg: 'audio/ogg; codecs=opus', m4a: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg', amr: 'audio/amr',
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', txt: 'text/plain', vcf: 'text/vcard',
}

/** Qué tipo de mensaje es un adjunto, por su nombre y lo que dice el texto. */
export function tipoDeAdjunto(nombre, rotulo) {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(nombre)?.[1] || '').toLowerCase()
  const mime = MIMES[ext] || 'application/octet-stream'
  if (rotulo && POR_ROTULO[rotulo]) return { tipo: POR_ROTULO[rotulo], mime }
  if (ext === 'webp') return { tipo: 'sticker', mime }
  if (mime.startsWith('image/')) return { tipo: 'imagen', mime }
  if (mime.startsWith('video/')) return { tipo: 'video', mime }
  if (ext === 'opus' || /^PTT-|-AUDIO-/i.test(path.basename(nombre))) return { tipo: 'nota_voz', mime: MIMES.opus }
  if (mime.startsWith('audio/')) return { tipo: 'audio', mime }
  return { tipo: 'documento', mime }
}

/**
 * El cuerpo de un mensaje → { tipo, texto, adjunto?, rotulo?, eliminado?, editado? }.
 * `adjunto` es el nombre del archivo, si el mensaje lo trae.
 */
export function interpretarCuerpo(cuerpo) {
  let c = cuerpo
  const r = {}
  if (/\s<Editado>$/.test(c)) {
    r.editado = true
    c = c.replace(/\s<Editado>$/, '')
  }
  if (/^<Eliminado>\s?/.test(c)) {
    r.eliminado = true
    c = c.replace(/^<Eliminado>\s?/, '')
  }
  let m
  // Este sistema: "<Foto: 2026-10-06 14.05.00 Foto.jpg (archivo adjunto)> leyenda"
  if ((m = /^<([^:>]+): (.+?) \(archivo adjunto\)>\s?([\s\S]*)$/.exec(c))) return { ...r, rotulo: m[1], adjunto: m[2], texto: m[3] }
  // Android: "IMG-20240101-WA0001.jpg (archivo adjunto)" y la leyenda abajo.
  if ((m = /^(.+?\.[a-z0-9]{1,5}) \((?:archivo adjunto|file attached)\)\s?([\s\S]*)$/i.exec(c))) return { ...r, adjunto: m[1], texto: m[2] }
  // iPhone: "<adjunto: 00000012-PHOTO-2024-01-01-12-00-00.jpg>"
  if ((m = /^<(?:adjunto|attached): (.+?)>\s?([\s\S]*)$/i.exec(c))) return { ...r, adjunto: m[1], texto: m[2] }
  // Archivos que no vinieron en el respaldo: "<Foto>", "<Documento: dni.pdf>", "<Multimedia omitido>".
  if ((m = /^<(Multimedia omitido|Media omitted|Foto|Video|GIF|Nota de voz|Audio|Documento|Sticker|Ubicación|Contacto|Producto|Para ver una vez)(?:: ([^>]+))?>\s?([\s\S]*)$/i.exec(c))) {
    const que = /omit/i.test(m[1]) ? 'Archivo' : m[1]
    return { ...r, tipo: 'otro', texto: `${que}${m[2] ? `: ${m[2]}` : ''} (no estaba en el respaldo)${m[3] ? `\n${m[3]}` : ''}` }
  }
  return { ...r, tipo: 'texto', texto: c }
}

/* ---------------- Cargar en el historial ---------------- */

const normalizar = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
const digitos = (t) => String(t || '').replace(/\D/g, '')

/** Nombre del chat según el archivo del celular: "Chat de WhatsApp con Juan.txt", "WhatsApp Chat - Juan.zip". */
export function nombreDesdeArchivo(nombre) {
  const base = path.basename(String(nombre || '')).replace(/\.(txt|zip|rar)$/i, '')
  return /^(?:Chat de WhatsApp con|Chat de WhatsApp -|WhatsApp Chat with|WhatsApp Chat -)\s*(.+)$/i.exec(base)?.[1]?.trim() || null
}

/** A qué chat guardado va cada texto: por número (lo más seguro) o por nombre. */
function resolverChat({ carpeta, titulo, nombreArchivo }, chats) {
  const num = /^(\d{8,15})(?:\s|$)/.exec(carpeta || '')?.[1] || titulo?.telefono || null
  if (num) {
    const existente = chats.find((c) => digitos(c.telefono) === num)
    return { jid: existente?.id || `${num}@s.whatsapp.net`, nombre: existente?.nombre || titulo?.nombre || `+${num}` }
  }
  const grupo = /^Grupo - (.+)$/.exec(carpeta || '')?.[1]
  const nombre = grupo || titulo?.nombre || nombreDesdeArchivo(nombreArchivo) || null
  if (!nombre) return { error: 'no dice de qué chat es' }
  // El nombre puede ser un número: "+54 9 3564 11-1111".
  if (!grupo && /^\+?[\d\s-]{8,}$/.test(nombre)) {
    const n = digitos(nombre)
    const existente = chats.find((c) => digitos(c.telefono) === n)
    return { jid: existente?.id || `${n}@s.whatsapp.net`, nombre: existente?.nombre || nombre }
  }
  const iguales = chats.filter((c) => !!c.esGrupo === !!grupo && normalizar(c.nombre) === normalizar(nombre))
  const candidatos = iguales.length ? iguales : grupo ? [] : chats.filter((c) => !c.esGrupo && normalizar(c.nombre) === normalizar(nombre))
  if (candidatos.length === 1) return { jid: candidatos[0].id, nombre: candidatos[0].nombre, esGrupo: candidatos[0].esGrupo }
  if (candidatos.length > 1) return { error: `hay más de un chat que se llama "${nombre}"`, nombre }
  return { error: `no hay ningún chat guardado que se llame "${nombre}"`, nombre }
}

/** Quién mandó cada mensaje: la línea ("Neifert", el nombre de la cuenta) o el otro. */
function armarDeMi(mensajes, { nombreChat, nombrePropio, esGrupo }) {
  const propios = new Set(['neifert', 'tu', 'tú', 'yo', 'you', normalizar(nombrePropio)].filter(Boolean).map(normalizar))
  const esPropio = (autor) => propios.has(normalizar(autor)) || /^neifert \(/i.test(autor)
  if (esGrupo) return esPropio
  // En un chat de a dos, el que no es el contacto es la línea (exportado desde el celular,
  // los propios llevan el nombre de la cuenta, que acá puede no saberse).
  const autores = [...new Set(mensajes.filter((m) => !m.sistema).map((m) => m.autor))]
  const contacto = autores.find((a) => !esPropio(a) && normalizar(a) === normalizar(nombreChat))
  if (autores.length === 2 && contacto) return (autor) => autor !== contacto
  return esPropio
}

/**
 * Carga el respaldo `archivo` (ruta en disco). `nombreArchivo`: como se llamaba al subirlo
 * (en las exportaciones del celular dice de qué chat es). `nombrePropio`: el nombre de la
 * cuenta de WhatsApp de la línea. `avance(datos)`: se llama a medida que avanza.
 * Devuelve el resumen: cuántos chats, mensajes y archivos se sumaron y qué se salteó.
 */
export async function importarRespaldo(archivo, { nombreArchivo = '', nombrePropio = '', carpetaTmp, avance = () => {} } = {}) {
  const firma = Buffer.alloc(4)
  const fdFirma = fs.openSync(archivo, 'r')
  fs.readSync(fdFirma, firma, 0, 4, 0)
  fs.closeSync(fdFirma)
  // Se mira cómo empieza el archivo: un .zip arranca con "PK" y un .rar con "Rar!".
  const esRar = firma.toString('latin1') === 'Rar!' || (/[.]rar$/i.test(nombreArchivo) && firma.subarray(0, 2).toString('latin1') !== 'PK')
  const entradas = esRar ? await entradasRar(archivo, carpetaTmp) : entradasZip(archivo)
  try {
    const porRuta = new Map(entradas.map((e) => [e.ruta, e]))
    const porNombre = new Map()
    for (const e of entradas) porNombre.set(path.posix.basename(e.ruta).toLowerCase(), e)
    const textos = entradas.filter((e) => /\.txt$/i.test(e.ruta) && e.tamano < 200 * 1024 * 1024 && !/(^|\/)__MACOSX\//.test(e.ruta))
    const chats = listarChats()
    const corte = Math.floor(Date.now() / 1000) - VENTANA_DIAS * 86400
    const resumen = { chats: 0, mensajes: 0, archivos: 0, yaEstaban: 0, viejos: 0, salteados: [], archivosFaltantes: 0 }

    for (const [i, txt] of textos.entries()) {
      const carpeta = path.posix.dirname(txt.ruta) === '.' ? '' : path.posix.basename(path.posix.dirname(txt.ruta))
      const { titulo, mensajes } = leerChatTxt(txt.leer().toString('utf8'))
      if (!mensajes.length) continue
      const destino = resolverChat({ carpeta, titulo, nombreArchivo: textos.length === 1 ? nombreArchivo : txt.ruta }, chats)
      if (destino.error) {
        resumen.salteados.push({ archivo: txt.ruta, motivo: destino.error })
        continue
      }
      avance({ paso: i + 1, total: textos.length, chat: destino.nombre })
      const { jid } = destino
      // Un chat que no estaba guardado se queda con el nombre que trae el respaldo.
      const nuevoChat = !existeChat(jid) && titulo?.nombre && !/^\+?[\d\s-]+$/.test(titulo.nombre) ? titulo.nombre : null
      const deMi = armarDeMi(mensajes, { nombreChat: destino.nombre, nombrePropio, esGrupo: destino.esGrupo || jid.endsWith('@g.us') })
      // Lo que ya está guardado: mismo minuto, mismo lado y mismo texto.
      const clave = (ts, mio, texto, media) => `${Math.floor(ts / 60)}|${mio ? 1 : 0}|${media ? 'm' : 't'}|${normalizar(texto)}`
      const existentes = new Set(listarMensajes(jid).map((m) => clave(m.ts, m.deMi, m.texto, !!m.media)))
      const dirTxt = path.posix.dirname(txt.ruta)
      let sumados = 0
      for (const m of mensajes) {
        if (m.sistema) continue
        if (m.ts < corte) {
          resumen.viejos++
          continue
        }
        const mio = deMi(m.autor)
        const c = interpretarCuerpo(m.cuerpo)
        if (existentes.has(clave(m.ts, mio, c.texto, !!c.adjunto))) {
          resumen.yaEstaban++
          continue
        }
        const id = `IMP${crypto.createHash('sha1').update(`${jid}|${m.ts}|${m.autor}|${m.cuerpo}`).digest('hex').slice(0, 20).toUpperCase()}`
        const msg = { id, deMi: mio, ts: m.ts, texto: c.texto || '', origen: 'historial', importado: true }
        if (mio) {
          msg.estado = 'leido'
          const empleado = /^Neifert \((.+)\)$/i.exec(m.autor)?.[1]
          if (empleado) msg.enviadoPor = { id: null, nombre: empleado }
        } else if (jid.endsWith('@g.us')) msg.autorNombre = m.autor
        if (c.eliminado) msg.eliminado = { ts: m.ts, por: mio ? 'yo' : 'contacto' }
        if (c.editado) msg.editado = true
        if (c.adjunto) {
          const { tipo, mime } = tipoDeAdjunto(c.adjunto, c.rotulo)
          msg.tipo = tipo
          const entrada = porRuta.get(dirTxt === '.' ? c.adjunto : `${dirTxt}/${c.adjunto}`) || porNombre.get(path.posix.basename(c.adjunto).toLowerCase())
          if (entrada) {
            const datos = entrada.leer()
            const ext = (/\.([a-z0-9]{1,5})$/i.exec(c.adjunto)?.[1] || 'bin').toLowerCase()
            const nombreGuardado = `${id}.${ext}`
            await guardarMedia(jid, nombreGuardado, datos, mime)
            msg.media = { mime, tamano: datos.length, archivo: nombreGuardado, estado: 'ok', ...(tipo === 'documento' ? { nombre: path.posix.basename(c.adjunto) } : {}) }
            resumen.archivos++
          } else {
            resumen.archivosFaltantes++
            msg.tipo = 'otro'
            msg.texto = `Archivo no incluido en el respaldo: ${c.adjunto}${c.texto ? `\n${c.texto}` : ''}`
          }
        } else msg.tipo = c.tipo
        const { nuevo } = agregarMensaje(jid, msg, { avisar: false })
        if (nuevo) {
          sumados++
          existentes.add(clave(msg.ts, mio, msg.texto, !!msg.media))
        } else resumen.yaEstaban++
      }
      if (sumados && nuevoChat) upsertChat(jid, { pushName: nuevoChat })
      if (sumados) resumen.chats++
      resumen.mensajes += sumados
    }
    if (!textos.length) throw new Error('El respaldo no tiene ningún chat (.txt) adentro')
    return resumen
  } finally {
    entradas.cerrar?.()
  }
}
