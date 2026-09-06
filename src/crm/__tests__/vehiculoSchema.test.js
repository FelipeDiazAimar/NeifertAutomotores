import { describe, it, expect } from 'vitest'
import { vehiculoSchema } from '../lib/vehiculoSchema.js'

const base = { marca: 'Ford', modelo: 'KA', moneda: 'ARS' }

describe('vehiculoSchema', () => {
  it('acepta el payload mínimo', () => {
    expect(vehiculoSchema.safeParse(base).success).toBe(true)
  })
  it('marca vacía → error', () => {
    expect(vehiculoSchema.safeParse({ ...base, marca: '' }).success).toBe(false)
  })
  it('año fuera de rango → error', () => {
    expect(vehiculoSchema.safeParse({ ...base, anio: 1700 }).success).toBe(false)
    expect(vehiculoSchema.safeParse({ ...base, anio: 2015 }).success).toBe(true)
  })
  it('km negativo → error', () => {
    expect(vehiculoSchema.safeParse({ ...base, km: -5 }).success).toBe(false)
  })
  it('precio negativo → error', () => {
    expect(vehiculoSchema.safeParse({ ...base, precio_contado: -1 }).success).toBe(false)
  })
})
