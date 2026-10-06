import { describe, it, expect } from 'vitest'
import { brandKeyOf, groupVehiclesByBrand, paginarPorMarcas } from '../brandGroups'

describe('brandGroups', () => {
  it('brandKeyOf normaliza vacías a "Sin marca"', () => {
    expect(brandKeyOf({ brand: ' Ford ' })).toBe('Ford')
    expect(brandKeyOf({ brand: '' })).toBe('Sin marca')
    expect(brandKeyOf({})).toBe('Sin marca')
    expect(brandKeyOf(null)).toBe('Sin marca')
  })

  it('agrupa por marca ordenada A-Z (insensible a acentos) conservando el orden interno', () => {
    const vehicles = [
      { id: '1', brand: 'Toyota', model: 'Corolla' },
      { id: '2', brand: 'Audi', model: 'A4' },
      { id: '3', brand: 'Toyota', model: 'Etios' },
      { id: '4', brand: 'Áudi', model: 'Q5' },
    ]
    const groups = groupVehiclesByBrand(vehicles)
    // "Audi" y "Áudi" son marcas distintas como texto, pero vecinas en A-Z.
    expect(groups.map(([b]) => b)).toEqual(['Audi', 'Áudi', 'Toyota'])
    const toyota = groups.find(([b]) => b === 'Toyota')[1]
    expect(toyota.map((v) => v.id)).toEqual(['1', '3'])
  })

  it('lista vacía → sin grupos', () => {
    expect(groupVehiclesByBrand([])).toEqual([])
  })

  it('paginarPorMarcas acumula marcas enteras hasta el tope (nunca parte una)', () => {
    const groups = [
      ['Audi', new Array(2).fill({})],
      ['BMW', new Array(3).fill({})],
      ['Fiat', new Array(1).fill({})],
      ['Ford', new Array(30).fill({})],
      ['Honda', new Array(2).fill({})],
    ]
    const paginas = paginarPorMarcas(groups, 5)
    expect(paginas.map((p) => p.map(([b]) => b))).toEqual([
      ['Audi', 'BMW'],
      ['Fiat'],
      ['Ford'],
      ['Honda'],
    ])
  })
})
