import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'

/**
 * Convierte lo que graba el navegador (webm/opus en Chrome, mp4 en Safari) a
 * ogg/opus mono, que es el formato que WhatsApp reproduce como nota de voz.
 */
export function aNotaDeVoz(entrada) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ffmpeg no está disponible en este sistema'))
    const args = [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0',
      '-vn', '-ac', '1', '-ar', '48000',
      '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip',
      '-f', 'ogg', 'pipe:1',
    ]
    const proc = spawn(ffmpegPath, args)
    const salida = []
    let errores = ''
    proc.stdout.on('data', (d) => salida.push(d))
    proc.stderr.on('data', (d) => (errores += d))
    proc.on('error', reject)
    proc.on('close', (codigo) => {
      if (codigo === 0 && salida.length) resolve(Buffer.concat(salida))
      else reject(new Error(`No se pudo convertir el audio: ${errores.trim() || `ffmpeg salió con código ${codigo}`}`))
    })
    proc.stdin.on('error', () => {})
    proc.stdin.end(entrada)
  })
}
