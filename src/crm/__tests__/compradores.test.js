import { describe, it, expect } from 'vitest'
import {
  buscarCompradores,
  demandasDeCliente,
  hayFiltros,
  esInactivo,
} from '../lib/compradores.js'

// Un cliente con sus líneas de interés (la unidad que cruza la búsqueda).
const lead = (id, nombre, items) =>
  demandasDeCliente({ id, nombre, telefono: '1', status: 'activo', intereses: items })

const demandas = [
  ...(
    lead('l1', 'Ana', [{ marca: 'Toyota', modelo: 'Corolla', tipo: 'Sedan', valor: 20000000, moneda: 'ARS' }])
  ),
  ...(
    lead('l2', 'Beto', [{ marca: 'Toyota', modelo: 'Hilux', tipo: 'Pickup', valor: 40000000, moneda: 'ARS' }])
  ),
  ...(lead('l3', 'Cata', [{ marca: 'Ford', tipo: 'Sedan' }])),
  ...demandasDeCliente({
    id: 'c1',
    nombre: 'Dani',
    telefono: '2',
    status: 'activo',
    intereses: [{ marca: 'Toyota' }],
    presupuesto: 25000000,
  }),
]

const nombres = (r) => r.map((x) => x.persona.nombre)

describe('buscarCompradores', () => {
  it('sin filtros no devuelve nada', () => {
    expect(hayFiltros({})).toBe(false)
    expect(buscarCompradores(demandas, {})).toEqual([])
  })

  it('por marca: solo los que buscan esa marca', () => {
    expect(nombres(buscarCompradores(demandas, { marca: 'toyota' })).sort()).toEqual(['Ana', 'Beto', 'Dani'])
  })

  it('por tipo: ignora a los que tienen otro tipo o no cargaron tipo', () => {
    expect(nombres(buscarCompradores(demandas, { tipo: 'Sedan' })).sort()).toEqual(['Ana', 'Cata'])
  })

  it('un dato cargado que no coincide descarta (Ford no es Toyota)', () => {
    expect(nombres(buscarCompradores(demandas, { marca: 'Toyota', modelo: 'Corolla' }))).not.toContain('Cata')
  })

  it('un dato vacío de la demanda no descarta y suma menos', () => {
    const r = buscarCompradores(demandas, { marca: 'Toyota', modelo: 'Corolla' })
    expect(nombres(r)).toEqual(['Ana', 'Dani']) // Ana: marca+modelo, Dani: solo marca
    expect(r[0].score).toBeGreaterThan(r[1].score)
  })

  it('por rango de precio usa el valor aproximado', () => {
    const r = nombres(buscarCompradores(demandas, { precioMin: 15000000, precioMax: 30000000 }))
    expect(r).toContain('Ana')
    expect(r).not.toContain('Beto')
  })

  it('sin valor cargado igual aparece, marcado y al final', () => {
    const r = buscarCompradores(demandas, { precioMin: 15000000, precioMax: 30000000 })
    const cata = r.find((x) => x.persona.nombre === 'Cata')
    expect(cata.lineas[0].coincide).toContain('sin_valor')
    expect(cata.score).toBe(0)
    expect(nombres(r)[nombres(r).length - 1]).not.toBe('Ana')
    expect(r[0].persona.nombre).toBe('Ana')
  })

  it('con marca + precio, "sin valor" no mete a quien no coincide en la marca', () => {
    const r = nombres(buscarCompradores(demandas, { marca: 'Toyota', precioMin: 15000000, precioMax: 30000000 }))
    expect(r).not.toContain('Cata') // Ford
    expect(r).toContain('Dani') // Toyota, sin valor pero con presupuesto
  })

  it('esInactivo marca vendidos, perdidos y cerrados', () => {
    expect(esInactivo({ estado: 'vendido' })).toBe(true)
    expect(esInactivo({ estado: 'perdido' })).toBe(true)
    expect(esInactivo({ estado: 'cerrado' })).toBe(false)
    expect(esInactivo({ estado: 'activo' })).toBe(false)
    expect(esInactivo({ estado: 'nuevo' })).toBe(false)
  })

  it('el presupuesto del cliente alcanza si puede pagar el mínimo del rango', () => {
    expect(nombres(buscarCompradores(demandas, { precioMin: 20000000, precioMax: 30000000 }))).toContain('Dani')
    // presupuesto 25M < mínimo 30M: queda afuera aunque su interés no tenga valor
    expect(nombres(buscarCompradores(demandas, { precioMin: 30000000, precioMax: 40000000 }))).not.toContain('Dani')
  })

  it('convierte USD a pesos para comparar', () => {
    const d = lead('l9', 'Eva', [{ marca: 'Fiat', valor: 15000, moneda: 'USD' }])
    expect(nombres(buscarCompradores(d, { precioMin: 10000000, precioMax: 20000000, moneda: 'ARS' }))).toEqual(['Eva'])
    expect(nombres(buscarCompradores(d, { precioMin: 10000, precioMax: 20000, moneda: 'USD' }))).toEqual(['Eva'])
  })

  it('una persona con varias líneas aparece una sola vez', () => {
    const d = lead('l8', 'Fede', [{ marca: 'Toyota' }, { marca: 'Toyota', modelo: 'Etios' }])
    const r = buscarCompradores(d, { marca: 'Toyota' })
    expect(r).toHaveLength(1)
    expect(r[0].lineas).toHaveLength(2)
  })
})
