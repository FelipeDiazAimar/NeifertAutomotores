import './entorno.js'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { describe, expect, it } from 'vitest'
import { TROZO, crearCifrador, crearDescifrador, descifrarArchivo, esRespaldoCifrado } from '../src/cifradoFlujo.js'

const CLAVE = 'clave larga de prueba para el respaldo'

/** Pasa `datos` por un Transform en pedazos de `pedazo` bytes y junta lo que sale. */
async function pasar(transform, datos, pedazo = 64 * 1024) {
  const salida = []
  const partes = []
  for (let i = 0; i < datos.length; i += pedazo) partes.push(datos.subarray(i, i + pedazo))
  transform.on('data', (d) => salida.push(d))
  await pipeline(Readable.from(partes), transform)
  return Buffer.concat(salida)
}
const cifrar = (datos, pedazo) => pasar(crearCifrador(CLAVE), datos, pedazo)
const descifrar = (datos, clave = CLAVE, pedazo) => pasar(crearDescifrador(clave), datos, pedazo)

describe('cifrado en flujo del respaldo local', () => {
  it('ida y vuelta con tamaños en los bordes de un trozo', async () => {
    for (const largo of [0, 1, 1000, TROZO - 1, TROZO, TROZO + 1, 2 * TROZO, 2 * TROZO + 5]) {
      const datos = crypto.randomBytes(largo)
      const cifrado = await cifrar(datos)
      expect(Buffer.compare(await descifrar(cifrado), datos), `largo ${largo}`).toBe(0)
    }
  })

  it('un archivo grande, pasado en pedazos de cualquier tamaño, vuelve igual', async () => {
    const datos = crypto.randomBytes(5 * TROZO + 12345)
    const cifrado = await cifrar(datos, 777_777)
    expect(Buffer.compare(await descifrar(cifrado, CLAVE, 100_003), datos)).toBe(0)
  })

  it('lo cifrado no deja ver el contenido y cada vez sale distinto', async () => {
    const datos = Buffer.from('Hola, soy un mensaje de WhatsApp '.repeat(2000))
    const a = await cifrar(datos)
    const b = await cifrar(datos)
    expect(a.includes(Buffer.from('mensaje de WhatsApp'))).toBe(false)
    expect(Buffer.compare(a, b)).not.toBe(0)
    expect(a.subarray(0, 6).toString()).toBe('NFWB2\n')
  })

  it('con otra clave no se puede descifrar', async () => {
    const cifrado = await cifrar(crypto.randomBytes(5000))
    await expect(descifrar(cifrado, 'otra clave')).rejects.toThrow(/clave no es la correcta/)
  })

  it('un archivo cortado en cualquier punto no pasa por bueno', async () => {
    const cifrado = await cifrar(crypto.randomBytes(3 * TROZO + 10))
    // Cortado justo entre trozos (el caso difícil), a la mitad de uno y apenas con el encabezado.
    const entreTrozos = 26 + 2 * (5 + TROZO + 16)
    for (const corte of [entreTrozos, entreTrozos + 100, 26, 10, cifrado.length - 1]) {
      await expect(descifrar(cifrado.subarray(0, corte)), `corte en ${corte}`).rejects.toThrow()
    }
  })

  it('un byte cambiado, o trozos cambiados de lugar, se detectan', async () => {
    const cifrado = await cifrar(crypto.randomBytes(3 * TROZO + 10))
    const cambiado = Buffer.from(cifrado)
    cambiado[26 + 5 + 1000] ^= 1
    await expect(descifrar(cambiado)).rejects.toThrow(/clave no es la correcta/)

    const largo = 5 + TROZO + 16
    const [t0, t1] = [cifrado.subarray(26, 26 + largo), cifrado.subarray(26 + largo, 26 + 2 * largo)]
    const trocado = Buffer.concat([cifrado.subarray(0, 26), t1, t0, cifrado.subarray(26 + 2 * largo)])
    await expect(descifrar(trocado)).rejects.toThrow()
  })

  it('datos de más al final, o un archivo que no es de acá, se rechazan', async () => {
    const cifrado = await cifrar(Buffer.from('hola'))
    await expect(descifrar(Buffer.concat([cifrado, cifrado.subarray(26)]))).rejects.toThrow()
    await expect(descifrar(Buffer.from('PK este es un zip común y corriente'.repeat(3)))).rejects.toThrow(/No es un respaldo/)
  })

  it('descifra un archivo en disco; lo reconoce y, si falla, no deja nada a medias', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-flujo-'))
    const enc = path.join(dir, 'respaldo.enc')
    const zip = path.join(dir, 'respaldo.zip')
    const datos = crypto.randomBytes(2 * TROZO + 7)
    fs.writeFileSync(enc, await cifrar(datos))
    fs.writeFileSync(path.join(dir, 'comun.zip'), Buffer.from('PK\u0003\u0004 un zip'))
    expect(esRespaldoCifrado(enc)).toBe(true)
    expect(esRespaldoCifrado(path.join(dir, 'comun.zip'))).toBe(false)
    await descifrarArchivo(enc, zip, CLAVE)
    expect(Buffer.compare(fs.readFileSync(zip), datos)).toBe(0)
    fs.rmSync(zip)
    await expect(descifrarArchivo(enc, zip, 'otra')).rejects.toThrow(/clave no es la correcta/)
    expect(fs.existsSync(zip)).toBe(false)
  })
})
