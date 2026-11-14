import { describe, it, expect } from 'vitest'
import {
  COL_RANKED, COL_SIN, dividirPorRelevancia, columnaDe, moverEntreColumnas,
  reordenarEnColumna, cambiosDeRelevancia,
} from '../lib/relevancia.js'
import { idDeOrden, ORDENES_VEHICULOS } from '../lib/ordenVehiculos.js'
import { vistaDeRuta } from '../lib/vistas.js'

const v = (id, orden_relevancia, anio = 2020, marca = 'Ford') => ({ id, orden_relevancia, anio, marca })

describe('dividirPorRelevancia', () => {
  it('ranking por posición y el resto por año desc', () => {
    const cols = dividirPorRelevancia([v('c', 2), v('x', null, 2018), v('a', 1), v('y', null, 2022)])
    expect(cols[COL_RANKED]).toEqual(['a', 'c'])
    expect(cols[COL_SIN]).toEqual(['y', 'x'])
  })
  it('sin datos devuelve columnas vacías', () => {
    expect(dividirPorRelevancia([])).toEqual({ [COL_RANKED]: [], [COL_SIN]: [] })
  })
})

describe('movimientos', () => {
  const cols = { [COL_RANKED]: ['a', 'b', 'c'], [COL_SIN]: ['x', 'y'] }

  it('columnaDe reconoce ids y nombres de columna', () => {
    expect(columnaDe(cols, 'b')).toBe(COL_RANKED)
    expect(columnaDe(cols, 'y')).toBe(COL_SIN)
    expect(columnaDe(cols, COL_SIN)).toBe(COL_SIN)
    expect(columnaDe(cols, 'zzz')).toBeNull()
  })

  it('pasar de "sin" al ranking lo inserta en el lugar de la card sobre la que está', () => {
    const r = moverEntreColumnas(cols, 'x', 'b')
    expect(r[COL_RANKED]).toEqual(['a', 'x', 'b', 'c'])
    expect(r[COL_SIN]).toEqual(['y'])
  })

  it('soltar sobre la columna vacía lo agrega al final', () => {
    const r = moverEntreColumnas({ [COL_RANKED]: [], [COL_SIN]: ['x'] }, 'x', COL_RANKED)
    expect(r[COL_RANKED]).toEqual(['x'])
    expect(r[COL_SIN]).toEqual([])
  })

  it('quitar del ranking lo pasa a "sin"', () => {
    const r = moverEntreColumnas(cols, 'a', COL_SIN)
    expect(r[COL_RANKED]).toEqual(['b', 'c'])
    expect(r[COL_SIN]).toEqual(['x', 'y', 'a'])
  })

  it('misma columna no cambia en moverEntreColumnas; reordenarEnColumna sí', () => {
    expect(moverEntreColumnas(cols, 'a', 'c')).toBe(cols)
    expect(reordenarEnColumna(cols, 'a', 'c')[COL_RANKED]).toEqual(['b', 'c', 'a'])
    expect(reordenarEnColumna(cols, 'c', 'a')[COL_RANKED]).toEqual(['c', 'a', 'b'])
  })
})

describe('cambiosDeRelevancia', () => {
  it('solo devuelve las posiciones que cambian', () => {
    const actuales = new Map([['a', 1], ['b', 2], ['c', 3], ['x', null]])
    const nuevo = { [COL_RANKED]: ['a', 'x', 'b'], [COL_SIN]: ['c'] }
    expect(cambiosDeRelevancia(actuales, nuevo)).toEqual([
      { id: 'x', orden_relevancia: 2 },
      { id: 'b', orden_relevancia: 3 },
      { id: 'c', orden_relevancia: null },
    ])
  })
  it('sin movimientos no hay cambios', () => {
    const actuales = new Map([['a', 1], ['x', null]])
    expect(cambiosDeRelevancia(actuales, { [COL_RANKED]: ['a'], [COL_SIN]: ['x'] })).toEqual([])
  })
})

describe('orden de la lista de vehículos', () => {
  it('tiene las opciones del catálogo y Relevancia primero', () => {
    expect(ORDENES_VEHICULOS.map((o) => o.id)).toEqual(['relevance', 'brand-asc', 'model-asc', 'year-desc', 'km-asc'])
  })
  it('idDeOrden reconoce el orden por defecto y desconocidos', () => {
    expect(idDeOrden({ campo: 'marca', dir: 'asc' })).toBe('brand-asc')
    expect(idDeOrden({ campo: 'precio_contado', dir: 'desc' })).toBeNull()
  })
  it('/crm/relevancias cuelga de la vista Vehículos', () => {
    expect(vistaDeRuta('/crm/relevancias')).toBe('vehiculos')
  })
})

import { coincideBusqueda } from '../lib/relevancia.js'

describe('coincideBusqueda', () => {
  const auto = { marca: 'Citroën', modelo: 'C3', version: 'Feel', anio: 2022, color: 'Rojo', patente: 'AB123CD', duenio_nombre: 'María', duenio_apellido: 'Gómez' }
  it('vacío coincide todo', () => expect(coincideBusqueda(auto, '  ')).toBe(true))
  it('ignora tildes y mayúsculas', () => {
    expect(coincideBusqueda(auto, 'citroen')).toBe(true)
    expect(coincideBusqueda(auto, 'GOMEZ')).toBe(true)
  })
  it('todas las palabras deben estar (año, patente, dueño…)', () => {
    expect(coincideBusqueda(auto, 'c3 2022')).toBe(true)
    expect(coincideBusqueda(auto, 'ab123 maria')).toBe(true)
    expect(coincideBusqueda(auto, 'c3 2019')).toBe(false)
  })
})
