import { describe, it, expect } from 'vitest'
import { GESTORIA_ITEMS, fechasGestoria } from '../lib/gestoriaSchema.js'

describe('GESTORIA_ITEMS', () => {
  it('tiene los 8 trámites con label', () => {
    expect(GESTORIA_ITEMS.map((i) => i.key)).toEqual([
      'form08', 'verif_policial', 'multas_nac', 'dominio_hist',
      'libre_deudas', 'titulo', 'cedulas', 'identificacion',
    ])
    for (const i of GESTORIA_ITEMS) expect(i.label).toBeTruthy()
  })
})

describe('fechasGestoria', () => {
  it('usa fecha_inicio/cierre si la fila los trae', () => {
    expect(fechasGestoria({ fecha_inicio: '2026-01-01', fecha_cierre: '2026-02-01', estado: 'completo' }))
      .toEqual({ inicio: '2026-01-01', cierre: '2026-02-01' })
  })
  it('deriva inicio de la fecha de trámite más temprana', () => {
    const g = { estado: 'en_proceso', form08_fecha: '2026-06-08', cedulas_fecha: '2026-06-02' }
    expect(fechasGestoria(g).inicio).toBe('2026-06-02')
    expect(fechasGestoria(g).cierre).toBeNull()
  })
  it('deriva cierre solo si está completo', () => {
    const g = { estado: 'completo', form08_fecha: '2026-06-02', titulo_fecha: '2026-06-10' }
    expect(fechasGestoria(g)).toEqual({ inicio: '2026-06-02', cierre: '2026-06-10' })
  })
  it('sin fechas → null/null', () => {
    expect(fechasGestoria({ estado: 'sin_iniciar' })).toEqual({ inicio: null, cierre: null })
  })
})
