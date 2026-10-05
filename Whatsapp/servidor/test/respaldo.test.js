import { DIR_PRUEBA } from './entorno.js'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cifrar, descifrar, desempaquetar, empaquetarCarpeta } from '../src/respaldo.js'

describe('respaldo cifrado de la sesión', () => {
  it('cifra y descifra con la misma clave', () => {
    const datos = Buffer.from('creds.json de prueba ✓')
    const paquete = cifrar(datos, 'clave larga de prueba')
    expect(paquete.includes(datos)).toBe(false)
    expect(descifrar(paquete, 'clave larga de prueba').equals(datos)).toBe(true)
  })

  it('cada respaldo sale distinto (sal e IV al azar)', () => {
    const datos = Buffer.from('lo mismo')
    expect(cifrar(datos, 'k').equals(cifrar(datos, 'k'))).toBe(false)
  })

  it('rechaza la clave equivocada', () => {
    const paquete = cifrar(Buffer.from('secreto'), 'buena')
    expect(() => descifrar(paquete, 'mala')).toThrow(/clave no es la correcta/)
  })

  it('detecta un respaldo alterado', () => {
    const paquete = cifrar(Buffer.from('secreto'), 'buena')
    paquete[paquete.length - 1] ^= 1
    expect(() => descifrar(paquete, 'buena')).toThrow()
  })

  it('rechaza un archivo que no es un respaldo', () => {
    expect(() => descifrar(Buffer.from('cualquier cosa, no es un respaldo'), 'k')).toThrow(/No es un respaldo/)
  })

  it('empaqueta una carpeta completa y la recupera igual', () => {
    const dir = path.join(DIR_PRUEBA, 'sesion-falsa')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'creds.json'), '{"me":{"id":"549@s.whatsapp.net"}}')
    fs.writeFileSync(path.join(dir, 'pre-key-1.json'), Buffer.from([0, 1, 2, 255]))
    const vuelta = desempaquetar(descifrar(cifrar(empaquetarCarpeta(dir), 'k'), 'k'))
    expect(Object.keys(vuelta.archivos).sort()).toEqual(['creds.json', 'pre-key-1.json'])
    expect(Buffer.from(vuelta.archivos['pre-key-1.json'], 'base64')).toEqual(Buffer.from([0, 1, 2, 255]))
  })
})
