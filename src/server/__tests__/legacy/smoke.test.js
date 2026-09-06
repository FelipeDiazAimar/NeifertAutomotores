import { describe, it, expect } from 'vitest'
import clientes from '../fixtures/legacy/clientes.json'

describe('fixtures', () => {
  it('clientes fixture has records and write shapes', () => {
    expect(clientes.get.length).toBeGreaterThan(0)
    expect(clientes.post).toBeTruthy()
    expect(clientes.put).toBeTruthy()
  })
})
