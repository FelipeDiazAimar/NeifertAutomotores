import { describe, it, expect } from 'vitest'
import { tareaSchema } from '../lib/tareaSchema.js'

describe('tareaSchema', () => {
  it('acepta lo mínimo', () => {
    expect(tareaSchema.safeParse({ titulo: 'Llamar a Ana', fecha: '2026-09-01' }).success).toBe(true)
  })
  it('título vacío → error', () => {
    expect(tareaSchema.safeParse({ titulo: '', fecha: '2026-09-01' }).success).toBe(false)
  })
  it('fecha vacía → error', () => {
    expect(tareaSchema.safeParse({ titulo: 'x', fecha: '' }).success).toBe(false)
  })
})
