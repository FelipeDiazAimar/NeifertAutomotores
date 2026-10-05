import { describe, expect, it } from 'vitest'
import { mismoNumero, normalizarAR } from '../src/telefono.js'

describe('normalizarAR', () => {
  it.each([
    ['+54 9 3564 56-2413', '5493564562413'],
    ['5493564562413', '5493564562413'],
    ['54 3564 562413', '5493564562413'], // sin el 9 de celular
    ['0 3564 15 562413', '5493564562413'], // con 0 y 15 locales
    ['03564 15562413', '5493564562413'],
    ['3564 562413', '5493564562413'], // 10 dígitos sueltos
    ['011 15 4444 5555', '5491144445555'], // Buenos Aires: característica de 2
    ['0054 9 11 4444 5555', '5491144445555'],
    ['3576412286', '5493576412286'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarAR(entrada)).toBe(esperado)
  })

  it('deja los números de otro país con sus dígitos', () => {
    expect(normalizarAR('+1 (555) 123-4567')).toBe('15551234567')
    expect(normalizarAR('+598 99 123 456')).toBe('59899123456')
  })

  it('devuelve vacío si no hay número', () => {
    expect(normalizarAR('')).toBe('')
    expect(normalizarAR(null)).toBe('')
    expect(normalizarAR('sin teléfono')).toBe('')
  })
})

describe('mismoNumero', () => {
  it('compara cualquier forma de escribir el mismo celular', () => {
    expect(mismoNumero('+5493406518585', '3406 51-8585')).toBe(true)
    expect(mismoNumero('549 3406 518585', '0 3406 15 518585')).toBe(true)
    expect(mismoNumero('5493406518585', '5493406518586')).toBe(false)
  })
  it('dos vacíos no son el mismo número', () => {
    expect(mismoNumero('', '')).toBe(false)
  })
})
