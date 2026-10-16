/*
 * Todo lo que pasa por ffmpeg (viene con el servidor, ffmpeg-static): convertir notas de
 * voz, sacar la forma de onda real de un audio y armar miniaturas de fotos y videos.
 */
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ffmpegStatic from 'ffmpeg-static'

// La app de escritorio trae su propio ffmpeg (WA_FFMPEG): así los paquetes de actualización
// del servidor no cargan los 80 MB del binario.
const ffmpegPath = process.env.WA_FFMPEG || ffmpegStatic

/** Corre ffmpeg con `entrada` por stdin (o un archivo en los args) y devuelve stdout. */
function ffmpeg(args, entrada) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ffmpeg no está disponible en este sistema'))
    const proc = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...args])
    const salida = []
    let errores = ''
    proc.stdout.on('data', (d) => salida.push(d))
    proc.stderr.on('data', (d) => (errores += d))
    proc.on('error', reject)
    proc.on('close', (codigo) => {
      if (codigo === 0 && salida.length) resolve(Buffer.concat(salida))
      else reject(new Error(errores.trim() || `ffmpeg salió con código ${codigo}`))
    })
    proc.stdin.on('error', () => {})
    if (entrada) proc.stdin.end(entrada)
    else proc.stdin.end()
  })
}

/**
 * Convierte lo que graba el navegador (webm/opus en Chrome, mp4 en Safari) a
 * ogg/opus mono, que es el formato que WhatsApp reproduce como nota de voz.
 */
// CRC de las páginas Ogg (polinomio 0x04c11db7, sin reflejar).
const TABLA_CRC = Array.from({ length: 256 }, (_, i) => {
  let r = i << 24
  for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1
  return r >>> 0
})
function crcOgg(pagina) {
  let crc = 0
  for (const b of pagina) crc = ((crc << 8) ^ TABLA_CRC[((crc >>> 24) ^ b) & 0xff]) >>> 0
  return crc
}

/** Los paquetes de un Ogg, en orden, y la posición (granule) de la última página. */
function paquetesOgg(ogg) {
  const paquetes = []
  let granule = 0
  let serie = 0
  let pendiente = []
  for (let p = 0; p + 27 <= ogg.length && ogg.toString('latin1', p, p + 4) === 'OggS'; ) {
    const segs = ogg[p + 26]
    serie = ogg.readUInt32LE(p + 14)
    granule = Number(ogg.readBigInt64LE(p + 6))
    let q = p + 27 + segs
    for (const largo of ogg.subarray(p + 27, p + 27 + segs)) {
      pendiente.push(ogg.subarray(q, q + largo))
      q += largo
      // Un segmento de menos de 255 bytes cierra el paquete.
      if (largo < 255) {
        paquetes.push(Buffer.concat(pendiente))
        pendiente = []
      }
    }
    p = q
  }
  return { paquetes, granule, serie }
}

/** Cuántas muestras (a 48 kHz) tiene cada tramo de un paquete Opus, según su TOC. */
function muestrasPorTramo(toc) {
  const config = toc >> 3
  const ms = config < 12 ? [10, 20, 40, 60][config & 3] : config < 16 ? [10, 20][config & 1] : [2.5, 5, 10, 20][config & 3]
  return ms * 48
}

/**
 * Junta paquetes de un tramo (código 0) en paquetes de hasta 6 tramos (código 3, tamaño
 * variable), como los arma el celular: 6 tramos de 20 ms = 120 ms por paquete.
 */
function juntarTramos(paquetes, porPaquete = 6) {
  const salida = []
  let grupo = []
  const cerrar = () => {
    if (!grupo.length) return
    const tramos = grupo.map((p) => p.subarray(1))
    const largos = []
    for (const t of tramos.slice(0, -1)) {
      if (t.length < 252) largos.push(t.length)
      else {
        const primero = 252 + (t.length & 3)
        largos.push(primero, (t.length - primero) >> 2)
      }
    }
    // TOC con código 3 (también el último, aunque quede de un tramo, como el celular) y la
    // cantidad de tramos, con la marca de tamaño variable si hay más de uno.
    const cabeza = Buffer.from([(grupo[0][0] & 0xfc) | 3, (grupo.length > 1 ? 0x80 : 0) | grupo.length, ...largos])
    salida.push({ datos: Buffer.concat([cabeza, ...tramos]), muestras: muestrasPorTramo(grupo[0][0]) * grupo.length })
    grupo = []
  }
  for (const p of paquetes) {
    // Solo se juntan tramos sueltos con la misma configuración; cualquier otro paquete va solo.
    if ((p[0] & 3) !== 0) {
      cerrar()
      salida.push({ datos: p, muestras: muestrasPorTramo(p[0]) * ((p[0] & 3) === 3 ? p[1] & 0x3f : 2) })
      continue
    }
    if (grupo.length && ((grupo[0][0] & 0xfc) !== (p[0] & 0xfc) || grupo.length === porPaquete)) cerrar()
    grupo.push(p)
  }
  cerrar()
  return salida
}

/** Una página Ogg con sus paquetes enteros. */
function paginaOgg({ paquetes, granule, serie, numero, tipo = 0 }) {
  const segmentos = []
  for (const p of paquetes) {
    for (let r = p.length; ; r -= 255) {
      segmentos.push(Math.min(r, 255))
      if (r < 255) break
    }
  }
  const cabecera = Buffer.alloc(27)
  cabecera.write('OggS', 0, 'latin1')
  cabecera[5] = tipo
  cabecera.writeBigInt64LE(BigInt(granule), 6)
  cabecera.writeUInt32LE(serie, 14)
  cabecera.writeUInt32LE(numero, 18)
  cabecera[26] = segmentos.length
  const pagina = Buffer.concat([cabecera, Buffer.from(segmentos), ...paquetes])
  pagina.writeUInt32LE(crcOgg(pagina), 22)
  return pagina
}

/**
 * Rearma el Ogg de ffmpeg como el de las notas que graba el celular:
 * - la etiqueta (OpusTags) dice "WhatsApp", sin comentarios;
 * - paquetes de 6 tramos de 20 ms (ffmpeg los deja de a uno, o de 2 tramos de 60 ms);
 * - páginas de 14 paquetes (1,68 s) y la última sin la marca de fin, como el celular.
 * El iPhone reproducía la nota al llegar pero después la daba por "no disponible".
 */
export function comoElCelular(ogg) {
  const { paquetes, granule: final, serie } = paquetesOgg(ogg)
  if (paquetes.length < 3 || paquetes[0].toString('latin1', 0, 8) !== 'OpusHead') return ogg
  const preskip = paquetes[0].readUInt16LE(10)
  const vendor = Buffer.from('WhatsApp')
  const etiqueta = Buffer.alloc(8 + 4 + vendor.length + 4)
  etiqueta.write('OpusTags', 0, 'latin1')
  etiqueta.writeUInt32LE(vendor.length, 8)
  vendor.copy(etiqueta, 12)
  etiqueta.writeUInt32LE(0, 12 + vendor.length)

  const audio = juntarTramos(paquetes.slice(2))
  const paginas = [
    paginaOgg({ paquetes: [paquetes[0]], granule: 0, serie, numero: 0, tipo: 2 }),
    paginaOgg({ paquetes: [etiqueta], granule: 0, serie, numero: 1 }),
  ]
  const POR_PAGINA = 14
  let muestras = preskip
  for (let i = 0; i < audio.length; i += POR_PAGINA) {
    const tanda = audio.slice(i, i + POR_PAGINA)
    muestras += tanda.reduce((s, p) => s + p.muestras, 0)
    const ultima = i + POR_PAGINA >= audio.length
    // La última lleva la posición que calculó ffmpeg: descuenta el relleno del final.
    const granule = ultima ? Math.min(muestras, final) : muestras
    paginas.push(paginaOgg({ paquetes: tanda.map((p) => p.datos), granule, serie, numero: paginas.length }))
  }
  return Buffer.concat(paginas)
}

/**
 * Cuánto dura un Ogg/Opus de verdad, en segundos: la posición de la última página menos
 * el pre-skip del encabezado. null si no se puede leer.
 */
export function duracionOgg(ogg) {
  let p = 0
  let granule = null
  let preskip = 0
  while (p + 27 <= ogg.length && ogg.toString('latin1', p, p + 4) === 'OggS') {
    const segs = ogg[p + 26]
    const cuerpo = ogg.subarray(p + 27, p + 27 + segs).reduce((s, x) => s + x, 0)
    if (ogg.toString('latin1', p + 27 + segs, p + 35 + segs) === 'OpusHead') preskip = ogg.readUInt16LE(p + 27 + segs + 10)
    granule = Number(ogg.readBigInt64LE(p + 6))
    p += 27 + segs + cuerpo
  }
  return granule == null || granule < preskip ? null : (granule - preskip) / 48000
}

export async function aNotaDeVoz(entrada) {
  try {
    // Igual que la nota que graba el celular: modo voz de Opus (SILK, banda ancha de 8 kHz),
    // tramos de 20 ms, unos 16 kbps y sin los datos que agrega ffmpeg. El iPhone es
    // exigente: con el modo música (CELT) que elegía ffmpeg la reproducía al llegar, pero
    // después mostraba "Este audio ya no está disponible". Los tramos se juntan de a 6
    // por paquete después (comoElCelular): ffmpeg no lo hace.
    const ogg = await ffmpeg(
      [
        '-i', 'pipe:0', '-vn', '-map_metadata', '-1', '-ac', '1', '-ar', '48000',
        '-c:a', 'libopus', '-b:a', '16k', '-vbr', 'on', '-application', 'voip', '-frame_duration', '20', '-cutoff', '8000',
        '-fflags', '+bitexact', '-flags:a', '+bitexact', '-f', 'ogg', 'pipe:1',
      ],
      entrada,
    )
    return comoElCelular(ogg)
  } catch (err) {
    throw new Error(`No se pudo convertir el audio: ${err.message}`, { cause: err })
  }
}

/**
 * Forma de onda real de un audio, como la que dibuja WhatsApp: 64 valores de 0 a 100
 * (el pico de cada tramo, normalizado al más alto).
 */
export async function formaDeOnda(audio, barras = 64) {
  // PCM de 16 bits, mono, 8 kHz: alcanza para la forma y es liviano.
  const pcm = await ffmpeg(['-i', 'pipe:0', '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'], audio)
  const muestras = pcm.length >> 1
  if (!muestras) return null
  const porBarra = Math.max(1, Math.floor(muestras / barras))
  const picos = []
  for (let b = 0; b < barras; b++) {
    let pico = 0
    const fin = Math.min(muestras, (b + 1) * porBarra)
    for (let i = b * porBarra; i < fin; i++) pico = Math.max(pico, Math.abs(pcm.readInt16LE(i * 2)))
    picos.push(pico)
  }
  const max = Math.max(...picos) || 1
  return picos.map((p) => Math.round((p / max) * 100))
}

/**
 * Miniatura JPEG (480 px de ancho como mucho) de una foto o del primer segundo de un
 * video. Así la lista de mensajes no baja fotos de varios MB para mostrar una vista previa.
 * Los videos van por un archivo temporal: ffmpeg necesita poder saltar dentro de un mp4.
 */
export async function miniatura(buffer, mime) {
  const escala = ['-vf', "scale='min(480,iw)':-2", '-frames:v', '1', '-f', 'image2', '-c:v', 'mjpeg', '-q:v', '5', 'pipe:1']
  if (!String(mime).startsWith('video/')) return ffmpeg(['-i', 'pipe:0', ...escala], buffer)
  const tmp = path.join(os.tmpdir(), `nfwa-${crypto.randomBytes(6).toString('hex')}`)
  fs.writeFileSync(tmp, buffer)
  try {
    return await ffmpeg(['-ss', '0.5', '-i', tmp, ...escala])
  } catch {
    // Videos de menos de medio segundo: el primer cuadro.
    return await ffmpeg(['-i', tmp, ...escala])
  } finally {
    fs.rmSync(tmp, { force: true })
  }
}
