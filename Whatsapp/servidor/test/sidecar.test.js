import './entorno.js'
import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'

const { sidecarDe } = await import('../src/whatsapp.js')

const hmac10 = (clave, datos) => crypto.createHmac('sha256', clave).update(datos).digest().subarray(0, 10)

describe('firma por bloques para el iPhone (streamingSidecar)', () => {
  const iv = Buffer.alloc(16, 7)
  const macKey = Buffer.alloc(32, 9)

  it('un audio corto lleva una sola firma de 10 bytes, sobre iv + archivo cifrado', () => {
    const cifrado = crypto.randomBytes(21098)
    const firma = sidecarDe(cifrado, iv, macKey)
    expect(firma).toHaveLength(10)
    expect(firma).toEqual(hmac10(macKey, Buffer.concat([iv, cifrado])))
  })

  it('uno largo lleva una firma por bloque de 64 KB, cada una con 16 bytes del siguiente', () => {
    const cifrado = crypto.randomBytes(150_000)
    const datos = Buffer.concat([iv, cifrado])
    const firma = sidecarDe(cifrado, iv, macKey)
    expect(firma).toHaveLength(30)
    expect(firma.subarray(0, 10)).toEqual(hmac10(macKey, datos.subarray(0, 65536 + 16)))
    expect(firma.subarray(10, 20)).toEqual(hmac10(macKey, datos.subarray(65536, 131072 + 16)))
    expect(firma.subarray(20)).toEqual(hmac10(macKey, datos.subarray(131072)))
  })
})
