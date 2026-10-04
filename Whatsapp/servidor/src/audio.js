/*
 * Todo lo que pasa por ffmpeg (viene con el servidor, ffmpeg-static): convertir notas de
 * voz, sacar la forma de onda real de un audio y armar miniaturas de fotos y videos.
 */
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ffmpegPath from 'ffmpeg-static'

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
export async function aNotaDeVoz(entrada) {
  try {
    return await ffmpeg(['-i', 'pipe:0', '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip', '-f', 'ogg', 'pipe:1'], entrada)
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
