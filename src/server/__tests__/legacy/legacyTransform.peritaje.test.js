import { describe, it, expect } from 'vitest'
import { transformPeritaje, transformGestoria, GESTORIA_ITEMS } from '../../legacyTransform.js'
import peritaje from '../fixtures/legacy/peritaje.json'
import gestoria from '../fixtures/legacy/gestoria.json'

describe('transformPeritaje', () => {
  it('keeps vehiculo_id + all section data, drops bookkeeping keys', () => {
    const src = peritaje.get[0]
    const row = transformPeritaje(src)
    expect(row.vehiculo_id).toBe(src.vehiculo_id)
    expect(row.secciones).not.toHaveProperty('created_at')
    expect(row.secciones).not.toHaveProperty('id')
    expect(row.secciones).toHaveProperty('motor')
  })
})

describe('transformGestoria', () => {
  const src = gestoria.get[0]
  it('maps flat GET columns into items + mirror booleans', () => {
    const row = transformGestoria(src)
    expect(row.vehiculo_id).toBe(src.vehiculo_id)
    for (const slug of GESTORIA_ITEMS) expect(typeof row[slug]).toBe('boolean')
    expect(row.items.form08).toMatchObject({ checked: expect.any(Boolean) })
    expect(row.form08).toBe(Boolean(src.form08 === 1 || src.form08 === '1'))
  })
  it('also accepts the nested POST items shape', () => {
    const row = transformGestoria({
      vehiculoId: 'v1', estado: 'en_proceso',
      items: { form08: { checked: true, fecha: '2026-08-30', obs: '', marcadoPor: 'Bruno' }, verificPolicial: { checked: false } },
      notas: 'x', fechaInicio: '', fechaCierre: '',
    })
    expect(row.vehiculo_id).toBe('v1')
    expect(row.form08).toBe(true)
    expect(row.verif_policial).toBe(false)
    expect(row.items.form08.marcado_por).toBe('Bruno')
    expect(row.fecha_inicio).toBe(null)
  })
})
