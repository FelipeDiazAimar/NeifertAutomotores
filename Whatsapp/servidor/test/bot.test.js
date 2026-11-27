import './entorno.js'
import { describe, expect, it } from 'vitest'
import { filtrarVehiculos } from '../src/vehiculosFiltro.js'

const AUTO = (o) => ({ reservado: false, nuevo: false, km: 50000, combustible: 'Nafta', transmision: 'Manual', moneda: 'USD', ...o })
const LISTA = [
  AUTO({ id: 1, nombre: 'Toyota Corolla XEi', marca: 'Toyota', modelo: 'Corolla XEi', anio: 2019, precio: 21000 }),
  AUTO({ id: 2, nombre: 'Toyota Etios X', marca: 'Toyota', modelo: 'Etios X', anio: 2017, precio: 11000, km: 90000 }),
  AUTO({ id: 3, nombre: 'Volkswagen Gol Trend', marca: 'Volkswagen', modelo: 'Gol Trend', anio: 2015, precio: 9000, km: 120000, reservado: true }),
  AUTO({ id: 4, nombre: 'Ford Ranger Limited', marca: 'Ford', modelo: 'Ranger', anio: 2024, precio: 52000000, moneda: 'ARS', combustible: 'Diésel', transmision: 'Automática', nuevo: true, km: 0 }),
  AUTO({ id: 5, nombre: 'Peugeot 208', marca: 'Peugeot', modelo: '208', anio: 2020, precio: null }),
]
const ids = (r) => r.vehiculos.map((v) => v.id)

describe('catálogo para el bot: filtros', () => {
  it('sin filtros devuelve todo (hasta el límite) con el total', () => {
    const r = filtrarVehiculos(LISTA, {})
    expect(r.total).toBe(5)
    expect(filtrarVehiculos(LISTA, { limite: 2 })).toMatchObject({ total: 5, vehiculos: [{ id: 1 }, { id: 2 }] })
  })

  it('marca, modelo y texto libre sin importar tildes ni mayúsculas', () => {
    expect(ids(filtrarVehiculos(LISTA, { marca: 'TOYOTA' }))).toEqual([1, 2])
    expect(ids(filtrarVehiculos(LISTA, { modelo: 'gol' }))).toEqual([3])
    expect(ids(filtrarVehiculos(LISTA, { q: 'diesel automatica' }))).toEqual([4])
    expect(ids(filtrarVehiculos(LISTA, { q: 'toyota 2019' }))).toEqual([1])
  })

  it('año, kilómetros y combustible', () => {
    expect(ids(filtrarVehiculos(LISTA, { anioDesde: 2019 }))).toEqual([1, 4, 5])
    expect(ids(filtrarVehiculos(LISTA, { anioHasta: 2016 }))).toEqual([3])
    expect(ids(filtrarVehiculos(LISTA, { kmMax: 60000 }))).toEqual([1, 4, 5])
    expect(ids(filtrarVehiculos(LISTA, { combustible: 'diésel' }))).toEqual([4])
  })

  it('precio máximo: respeta la moneda y deja afuera a los sin precio', () => {
    expect(ids(filtrarVehiculos(LISTA, { precioMax: 12000, moneda: 'USD' }))).toEqual([2, 3])
    expect(ids(filtrarVehiculos(LISTA, { precioMax: 60000000, moneda: 'ARS' }))).toEqual([4])
    expect(ids(filtrarVehiculos(LISTA, { precioMax: 99999999 }))).not.toContain(5)
  })

  it('0 km y solo disponibles', () => {
    expect(ids(filtrarVehiculos(LISTA, { nuevo: '1' }))).toEqual([4])
    expect(ids(filtrarVehiculos(LISTA, { disponibles: '1' }))).toEqual([1, 2, 4, 5])
  })

  it('límite entre 1 y 25 y valores raros no rompen nada', () => {
    const muchos = Array.from({ length: 40 }, (_, i) => AUTO({ id: i, nombre: `Auto ${i}`, marca: 'X', modelo: 'Y', anio: 2020, precio: 1 }))
    expect(filtrarVehiculos(muchos, { limite: 999 }).vehiculos).toHaveLength(25)
    expect(filtrarVehiculos(muchos, { limite: 0 }).vehiculos).toHaveLength(1)
    expect(filtrarVehiculos(muchos, { limite: 'abc', anioDesde: 'x' }).vehiculos).toHaveLength(10)
  })
})
