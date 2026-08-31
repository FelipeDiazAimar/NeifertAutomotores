import { describe, it, expect } from 'vitest'
import { clienteSchema } from '../lib/clienteSchema.js'

describe('clienteSchema', () => {
  it('acepta el payload mínimo', () => {
    expect(clienteSchema.safeParse({ nombre: 'Ana' }).success).toBe(true)
  })
  it('nombre vacío → error', () => {
    expect(clienteSchema.safeParse({ nombre: '' }).success).toBe(false)
  })
  it('presupuesto negativo → error', () => {
    expect(clienteSchema.safeParse({ nombre: 'Ana', presupuesto: -1 }).success).toBe(false)
  })
  it('año fuera de rango → error', () => {
    expect(clienteSchema.safeParse({ nombre: 'Ana', anio_min: 1700 }).success).toBe(false)
  })
})
