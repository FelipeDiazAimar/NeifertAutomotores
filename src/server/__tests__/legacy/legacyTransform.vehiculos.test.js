import { describe, it, expect } from 'vitest'
import { transformVehiculo, extractImagenes } from '../../legacyTransform.js'
import vehiculos from '../fixtures/legacy/vehiculos.json'

describe('transformVehiculo', () => {
  const v = vehiculos.get[0]
  it('maps core fields with numeric coercion', () => {
    const { vehiculo } = transformVehiculo(v)
    expect(typeof vehiculo.id).toBe('string')
    expect(vehiculo.marca).toBe(v.brand)
    expect(vehiculo.anio).toBe(v.year)
    expect(vehiculo.precio_contado === null || typeof vehiculo.precio_contado === 'number').toBe(true)
  })
  it('defaults unseen boolean flags to false, not null', () => {
    const { vehiculo } = transformVehiculo(v)
    expect(vehiculo.consignacion).toBe(false)
    expect(vehiculo.tiene_iva).toBe(false)
  })
  it('reads camelCase POST field names too', () => {
    const { vehiculo } = transformVehiculo({ id: 'x', brand: 'b', model: 'm', year: 2020, monedaContado: 'USD', precioContado: 15000, tieneIVA: true, consignacion: true })
    expect(vehiculo.moneda_contado).toBe('USD')
    expect(vehiculo.precio_contado).toBe(15000)
    expect(vehiculo.tiene_iva).toBe(true)
    expect(vehiculo.consignacion).toBe(true)
  })
})

describe('extractImagenes', () => {
  it('handles missing, string items, and object items', () => {
    expect(extractImagenes({})).toEqual([])
    expect(extractImagenes({ imagenes: ['a.jpg', 'b.jpg'] })).toEqual(['a.jpg', 'b.jpg'])
    expect(extractImagenes({ fotos: [{ url: 'c.jpg' }, { src: 'd.jpg' }] })).toEqual(['c.jpg', 'd.jpg'])
  })
})
