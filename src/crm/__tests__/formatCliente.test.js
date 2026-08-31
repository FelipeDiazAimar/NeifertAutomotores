import { describe, it, expect } from 'vitest'
import { lineaInteres, statusVariant, CANAL_OPCIONES } from '../lib/formatCliente.js'

describe('lineaInteres', () => {
  it('junta lo que hay', () => {
    expect(lineaInteres({ marca_interes: 'Nissan', modelo_interes: 'Kicks', tipo_interes: 'SUV', anio_min: 2017, anio_max: 2020, presupuesto: 30000000 }))
      .toContain('Nissan Kicks')
  })
  it('sin datos → guion', () => {
    expect(lineaInteres({})).toBe('—')
  })
})

describe('statusVariant', () => {
  it('mapea los 4 estados', () => {
    expect(statusVariant('activo')).toBe('green')
    expect(statusVariant('en_seguimiento')).toBe('amber')
    expect(statusVariant('vendido')).toBe('neutral')
    expect(statusVariant('perdido')).toBe('red')
  })
})

describe('CANAL_OPCIONES', () => {
  it('tiene id y label', () => {
    expect(CANAL_OPCIONES.every((o) => o.id && o.label)).toBe(true)
  })
})
