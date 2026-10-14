import './entorno.js'
import { spawnSync } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'
import { describe, expect, it } from 'vitest'
import { aNotaDeVoz, duracionOgg } from '../src/audio.js'

/** Las páginas del Ogg: [{ datos }] con el contenido de cada una. */
function paginas(ogg) {
  const out = []
  for (let p = 0; p < ogg.length && ogg.toString('latin1', p, p + 4) === 'OggS'; ) {
    const segs = ogg[p + 26]
    const cuerpo = ogg.subarray(p + 27, p + 27 + segs).reduce((s, x) => s + x, 0)
    out.push({ datos: ogg.subarray(p + 27 + segs, p + 27 + segs + cuerpo) })
    p += 27 + segs + cuerpo
  }
  return out
}

describe('nota de voz con el mismo formato que la del celular (el iPhone es exigente)', () => {
  it('etiqueta "WhatsApp" sin comentarios, modo voz, paquetes de varios tramos y un archivo que se puede leer', async () => {
    const fuente = spawnSync(ffmpegPath, ['-f', 'lavfi', '-i', 'sine=frequency=220:duration=2', '-c:a', 'libopus', '-f', 'webm', 'pipe:1'], { maxBuffer: 1e8 }).stdout
    const ogg = await aNotaDeVoz(fuente)
    const [cabeza, etiqueta, audio] = paginas(ogg)
    expect(cabeza.datos.toString('latin1', 0, 8)).toBe('OpusHead')
    expect(cabeza.datos[9]).toBe(1) // mono
    expect(etiqueta.datos.toString('latin1', 0, 8)).toBe('OpusTags')
    expect(etiqueta.datos.subarray(12, 20).toString()).toBe('WhatsApp')
    expect(etiqueta.datos).toHaveLength(24)
    expect(audio.datos[0] >> 3).toBeLessThan(12) // modo voz (SILK), como el del celular, no música (CELT)
    expect(audio.datos[0] & 3).toBeGreaterThan(0) // paquetes de varios tramos (120 ms)
    // ffmpeg verifica el CRC de cada página: si la etiqueta quedó mal armada, falla.
    const r = spawnSync(ffmpegPath, ['-v', 'error', '-i', 'pipe:0', '-f', 'null', '-'], { input: ogg })
    expect(r.status).toBe(0)
    expect(String(r.stderr).trim()).toBe('')
    // La duración real, para declararla redondeada para abajo como el celular (2 s de audio).
    expect(duracionOgg(ogg)).toBeGreaterThan(1.9)
    expect(duracionOgg(ogg)).toBeLessThan(2.1)
  })
})
