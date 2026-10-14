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

/**
 * Deja la etiqueta del archivo (OpusTags) como la de las notas del celular: "WhatsApp" y
 * sin comentarios. Va sola en la segunda página del Ogg: se reemplaza esa página entera.
 */
export function etiquetaDeWhatsapp(ogg) {
  const largoPagina = (p) => 27 + ogg[p + 26] + ogg.subarray(p + 27, p + 27 + ogg[p + 26]).reduce((s, x) => s + x, 0)
  if (ogg.toString('latin1', 0, 4) !== 'OggS') return ogg
  const p2 = largoPagina(0)
  if (ogg.toString('latin1', p2, p2 + 4) !== 'OggS' || ogg.toString('latin1', p2 + 27 + ogg[p2 + 26], p2 + 35 + ogg[p2 + 26]) !== 'OpusTags') return ogg
  const vendor = Buffer.from('WhatsApp')
  const paquete = Buffer.alloc(8 + 4 + vendor.length + 4)
  paquete.write('OpusTags', 0, 'latin1')
  paquete.writeUInt32LE(vendor.length, 8)
  vendor.copy(paquete, 12)
  paquete.writeUInt32LE(0, 12 + vendor.length)
  const cabecera = Buffer.from(ogg.subarray(p2, p2 + 27))
  cabecera[26] = 1 // un solo segmento (el paquete mide menos de 255 bytes)
  const pagina = Buffer.concat([cabecera, Buffer.from([paquete.length]), paquete])
  pagina.writeUInt32LE(0, 22)
  pagina.writeUInt32LE(crcOgg(pagina), 22)
  return Buffer.concat([ogg.subarray(0, p2), pagina, ogg.subarray(p2 + largoPagina(p2))])
}

export async function aNotaDeVoz(entrada) {
  try {
    // Igual que la nota que graba el celular: paquetes de 60 ms (varios tramos de 20 ms en
    // cada uno), sin los datos que agrega ffmpeg (nombre del programa, encoder=…). El
    // iPhone es exigente con el archivo: con el formato por defecto de ffmpeg no la
    // reproducía ("Este audio ya no está disponible") aunque todo lo demás estaba bien.
    const ogg = await ffmpeg(
      [
        '-i', 'pipe:0', '-vn', '-map_metadata', '-1', '-ac', '1', '-ar', '48000',
        '-c:a', 'libopus', '-b:a', '24k', '-vbr', 'on', '-application', 'voip', '-frame_duration', '60',
        '-fflags', '+bitexact', '-flags:a', '+bitexact', '-f', 'ogg', 'pipe:1',
      ],
      entrada,
    )
    return etiquetaDeWhatsapp(ogg)
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
