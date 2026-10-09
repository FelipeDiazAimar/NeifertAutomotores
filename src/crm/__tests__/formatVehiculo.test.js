import { describe, it, expect } from 'vitest'
import { lineaSpecs, precioFmt, estadoVariant, estadoLabel, esNuevoVigente, NUEVO_VIGENCIA_MS } from '../lib/formatVehiculo.js'

const daysAgoIso = (d) => new Date(Date.now() - d * 86_400_000).toISOString()

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

describe('estadoLabel', () => {
  it('muestra los estados con mayúscula inicial', () => {
    expect(estadoLabel('disponible')).toBe('Disponible')
    expect(estadoLabel('reservado')).toBe('Reservado')
    expect(estadoLabel('vendido')).toBe('Vendido')
    expect(estadoLabel('baja')).toBe('Baja')
  })
})

describe('esNuevoVigente', () => {
  it('define la vigencia en 14 días', () => {
    expect(NUEVO_VIGENCIA_MS).toBe(14 * 24 * 60 * 60 * 1000)
  })
  it('vigente a los 13 días (shape pública)', () => {
    expect(esNuevoVigente({ is_new: true, es_nuevo_en: daysAgoIso(13) })).toBe(true)
  })
  it('vencido a los 15 días (shape pública)', () => {
    expect(esNuevoVigente({ is_new: true, es_nuevo_en: daysAgoIso(15) })).toBe(false)
  })
  it('vigente a los 13 días (shape CRM)', () => {
    expect(esNuevoVigente({ es_nuevo: true, es_nuevo_en: daysAgoIso(13) })).toBe(true)
  })
  it('vencido a los 15 días (shape CRM)', () => {
    expect(esNuevoVigente({ es_nuevo: true, es_nuevo_en: daysAgoIso(15) })).toBe(false)
  })
  it('sin flag → false', () => {
    expect(esNuevoVigente({ is_new: false, es_nuevo_en: daysAgoIso(1) })).toBe(false)
    expect(esNuevoVigente({ es_nuevo: false })).toBe(false)
    expect(esNuevoVigente({})).toBe(false)
    expect(esNuevoVigente(null)).toBe(false)
  })
  it('sin fecha → true', () => {
    expect(esNuevoVigente({ is_new: true })).toBe(true)
    expect(esNuevoVigente({ es_nuevo: true })).toBe(true)
  })
  it('usa created_at / creado_en como fallback', () => {
    expect(esNuevoVigente({ is_new: true, created_at: daysAgoIso(1) })).toBe(true)
    expect(esNuevoVigente({ is_new: true, created_at: daysAgoIso(15) })).toBe(false)
    expect(esNuevoVigente({ es_nuevo: true, creado_en: daysAgoIso(1) })).toBe(true)
    expect(esNuevoVigente({ es_nuevo: true, creado_en: daysAgoIso(15) })).toBe(false)
  })
})
