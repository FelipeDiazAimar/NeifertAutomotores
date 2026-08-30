import { describe, it, expect } from 'vitest'
import { transformCliente, parseMaybeJsonArray } from '../../legacyTransform.js'
import clientes from '../fixtures/legacy/clientes.json'

describe('parseMaybeJsonArray', () => {
  it('passes arrays through', () => {
    expect(parseMaybeJsonArray([{ a: 1 }])).toEqual([{ a: 1 }])
  })
  it('parses JSON-string arrays (legacy autos_entrega)', () => {
    expect(parseMaybeJsonArray('[{"brand":"ford"}]')).toEqual([{ brand: 'ford' }])
  })
  it('returns [] for null/garbage', () => {
    expect(parseMaybeJsonArray(null)).toEqual([])
    expect(parseMaybeJsonArray('not json')).toEqual([])
  })
})

describe('transformCliente', () => {
  const withBrands = clientes.get.find((c) => Array.isArray(c.brands) && c.brands.length)
  const withAE = clientes.get.find((c) => c.tiene_auto_entrega)

  it('maps core fields and coerces numerics', () => {
    const { cliente } = transformCliente(withAE)
    expect(typeof cliente.id).toBe('string')
    expect(cliente.tiene_auto_entrega).toBe(true)
    expect(cliente.presupuesto === null || typeof cliente.presupuesto === 'number').toBe(true)
  })

  it('extracts intereses from brands[]', () => {
    const { intereses } = transformCliente(withBrands)
    expect(intereses.length).toBe(withBrands.brands.length)
    expect(intereses[0]).toHaveProperty('marca')
    expect(intereses[0]).toHaveProperty('modelo')
  })

  it('extracts autosEntrega whether array or JSON string', () => {
    const asArray = transformCliente({ ...withAE, autosEntrega: [{ brand: 'x', model: 'y' }], autos_entrega: null })
    const asString = transformCliente({ ...withAE, autosEntrega: undefined, autos_entrega: '[{"brand":"x","model":"y"}]' })
    expect(asArray.autosEntrega).toEqual(asString.autosEntrega)
    expect(asArray.autosEntrega[0]).toMatchObject({ marca: 'x', modelo: 'y' })
  })
})
