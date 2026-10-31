import { describe, it, expect } from 'vitest'
import { normTexto, distancia, parecidas, coincidePalabra } from '../similitud.js'

describe('similitud', () => {
  it('normTexto saca tildes, mayúsculas y símbolos', () => {
    expect(normTexto('  Citroën  C4-Cactus! ')).toBe('citroen c4 cactus')
  })
  it('distancia cuenta letras cruzadas como un solo error', () => {
    expect(distancia('toyota', 'toyota')).toBe(0)
    expect(distancia('toyta', 'toyota')).toBe(1)
    expect(distancia('toyoat', 'toyota')).toBe(1)
  })
  it('parecidas tolera errores según el largo', () => {
    expect(parecidas('toyta', 'toyota')).toBe(true)
    expect(parecidas('corola', 'corolla')).toBe(true)
    expect(parecidas('ford', 'fiat')).toBe(false)
    expect(parecidas('kia', 'kya')).toBe(false) // corta: tiene que ser exacta
  })
  it('coincidePalabra acepta escribirla a medias', () => {
    expect(coincidePalabra('coro', 'corolla')).toBe(true)
    expect(coincidePalabra('hil', 'hilux')).toBe(true)
    expect(coincidePalabra('xx', 'hilux')).toBe(false)
  })
})
