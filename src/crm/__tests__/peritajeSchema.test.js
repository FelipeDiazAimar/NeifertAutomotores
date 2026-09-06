import { describe, it, expect } from 'vitest'
import {
  PERITAJE_SECCIONES, PERITAJE_ITEMS_ESTADO, resumenPeritaje, estadoPeritaje,
} from '../lib/peritajeSchema.js'

describe('PERITAJE_SECCIONES', () => {
  it('todo ítem tiene key único, label y tipo válido', () => {
    const keys = new Set()
    const tipos = new Set(['estado', 'texto', 'moneda', 'porcentaje'])
    for (const sec of PERITAJE_SECCIONES) {
      expect(sec.id).toBeTruthy()
      expect(sec.titulo).toBeTruthy()
      for (const it of sec.items) {
        expect(it.key).toBeTruthy()
        expect(keys.has(it.key), `dup ${it.key}`).toBe(false)
        keys.add(it.key)
        expect(it.label).toBeTruthy()
        expect(tipos.has(it.tipo)).toBe(true)
      }
    }
  })

  it('cubre las secciones esperadas', () => {
    const ids = PERITAJE_SECCIONES.map((s) => s.id)
    expect(ids).toEqual(
      expect.arrayContaining(['motor', 'rodante', 'electronica', 'accesorios', 'tapizados', 'carroceria', 'historial']),
    )
  })

  it('PERITAJE_ITEMS_ESTADO se deriva de los ítems tipo estado', () => {
    expect(PERITAJE_ITEMS_ESTADO).toContain('motor')
    expect(PERITAJE_ITEMS_ESTADO).toContain('frenos')
    expect(PERITAJE_ITEMS_ESTADO).not.toContain('obsMotor')
    expect(PERITAJE_ITEMS_ESTADO).not.toContain('costoB')
    expect(PERITAJE_ITEMS_ESTADO).not.toContain('dañoCapo')
  })
})

describe('resumenPeritaje', () => {
  it('cuenta ok/obs/falta e ignora texto y na', () => {
    expect(resumenPeritaje({ motor: 'ok', frenos: 'obs', abs: 'falta', cajaAT: 'na', obsMotor: 'x' }))
      .toEqual({ items_ok: 1, items_obs: 1, items_falta: 1 })
  })
  it('objeto vacío → 0/0/0', () => {
    expect(resumenPeritaje({})).toEqual({ items_ok: 0, items_obs: 0, items_falta: 0 })
  })
})

describe('estadoPeritaje', () => {
  it('sin peritaje → sin_iniciar', () => {
    expect(estadoPeritaje(null)).toBe('sin_iniciar')
  })
  it('peritaje sin ningún ítem cargado → en_proceso', () => {
    expect(estadoPeritaje({ items_ok: 0, items_obs: 0, items_falta: 0 })).toBe('en_proceso')
  })
  it('con faltas u observaciones → en_proceso', () => {
    expect(estadoPeritaje({ items_ok: 30, items_obs: 0, items_falta: 2 })).toBe('en_proceso')
    expect(estadoPeritaje({ items_ok: 30, items_obs: 1, items_falta: 0 })).toBe('en_proceso')
  })
  it('todo OK → completo', () => {
    expect(estadoPeritaje({ items_ok: 33, items_obs: 0, items_falta: 0 })).toBe('completo')
  })
})
