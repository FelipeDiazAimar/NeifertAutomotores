import { describe, it, expect } from 'vitest'
import { lineaSpecs, precioFmt, estadoVariant } from '../lib/formatVehiculo.js'

describe('lineaSpecs', () => {
  it('junta año, km y transmisión presentes', () => {
    expect(lineaSpecs({ anio: 2015, km: 128000, transmision: 'Manual' })).toBe('2015 · 128.000 km · Manual')
  })
  it('omite los ausentes', () => {
    expect(lineaSpecs({ anio: 2020 })).toBe('2020')
    expect(lineaSpecs({})).toBe('—')
  })
})

describe('precioFmt', () => {
  it('formatea miles es-AR con su moneda', () => {
    expect(precioFmt({ precio_contado: 12500, moneda: 'USD' })).toEqual({ monto: '12.500', moneda: 'USD' })
  })
  it('null → guion', () => {
    expect(precioFmt({ precio_contado: null, moneda: 'ARS' })).toEqual({ monto: '—', moneda: 'ARS' })
  })
})

describe('estadoVariant', () => {
  it('mapea los estados a variants de Badge', () => {
    expect(estadoVariant('disponible')).toBe('green')
    expect(estadoVariant('reservado')).toBe('amber')
    expect(estadoVariant('vendido')).toBe('neutral')
    expect(estadoVariant('baja')).toBe('red')
  })
})
