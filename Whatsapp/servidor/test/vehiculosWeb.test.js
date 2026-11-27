import './entorno.js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { filtrarVehiculos } from '../src/vehiculosFiltro.js'

// Supabase de mentira: guarda con qué columnas se pidió el catálogo y devuelve filas como las de la tabla real.
const pedidos = []
const FILAS = [
  { id: 'a1', marca: 'Toyota', modelo: 'Hilux', version: 'SRX', anio: 2021, km: 60000, combustible: 'Diésel', transmision: 'Manual', moneda: 'USD', precio: 42000, estado: 'disponible', es_nuevo: false, categoria: 'pickup', imagen_principal: null, imagenes: [], descripcion: '' },
  { id: 'a2', marca: 'Ford', modelo: 'Ranger', version: 'XLS', anio: 2026, km: 0, combustible: 'Diésel', transmision: 'Automática', moneda: 'USD', precio: 49000, estado: 'reservado', es_nuevo: true, categoria: 'pickup', imagen_principal: null, imagenes: [], descripcion: '' },
  { id: 'a3', marca: 'Chevrolet', modelo: 'Tracker', version: 'Premier', anio: 2023, km: 25000, combustible: 'Nafta', transmision: 'Automática', moneda: 'USD', precio: 27000, estado: 'disponible', es_nuevo: false, categoria: 'suv', imagen_principal: null, imagenes: [], descripcion: '' },
]
const fetchReal = globalThis.fetch
beforeAll(() => {
  vi.stubGlobal('fetch', async (url, ...resto) => {
    // Lo que sale hacia el servidor de la prueba (127.0.0.1) pasa de verdad; solo Supabase es de mentira.
    if (String(url).startsWith('http://127.0.0.1')) return fetchReal(url, ...resto)
    pedidos.push(String(url))
    return new Response(JSON.stringify(FILAS), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
})
afterAll(() => vi.unstubAllGlobals())

describe('catálogo de la página para el bot', () => {
  it('pide la categoría (sin ella no se puede buscar por tipo: "pickups")', async () => {
    const { vehiculosWeb } = await import('../src/whatsapp.js')
    const lista = await vehiculosWeb()
    const select = new URL(pedidos.at(-1)).searchParams.get('select').split(',')
    expect(select).toEqual(expect.arrayContaining(['categoria', 'es_nuevo', 'precio', 'moneda', 'estado']))
    expect(lista.map((v) => v.categoria)).toEqual(['pickup', 'pickup', 'suv'])
    expect(lista.map((v) => v.condicion)).toEqual(['usado', '0km', 'usado'])
  })

  it('con eso, "pickups usadas" y "0 km" devuelven lo que corresponde', async () => {
    const { vehiculosWeb } = await import('../src/whatsapp.js')
    const lista = await vehiculosWeb()
    expect(filtrarVehiculos(lista, { categoria: 'pickups', condicion: 'usado' }).vehiculos.map((v) => v.nombre)).toEqual(['Toyota Hilux SRX'])
    expect(filtrarVehiculos(lista, { condicion: '0km' }).vehiculos.map((v) => v.nombre)).toEqual(['Ford Ranger XLS'])
    expect(filtrarVehiculos(lista, { categoria: 'SUV', disponibles: '1' }).total).toBe(1)
    expect(lista.find((v) => v.nombre.includes('Ranger')).reservado).toBe(true)
  })
})

describe('GET /api/bot/vehiculos con un solo filtro', () => {
  it('cualquiera de los filtros (condicion, categoria, ordenar…) devuelve { total, vehiculos }; sin filtros, la lista', async () => {
    const express = (await import('express')).default
    const { rutasBot } = await import('../src/bot.js')
    const ruta = (fn) => async (req, res) => res.json(await fn(req))
    const app = express()
    app.use('/api/bot', rutasBot({ ruta, accion: (_n, fn) => ruta(fn) }))
    const servidor = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)) })
    try {
      const pedir = async (q) => (await fetch(`http://127.0.0.1:${servidor.address().port}/api/bot/vehiculos${q}`)).json()
      for (const q of ['?condicion=0km', '?categoria=pickup', '?ordenar=precio_asc', '?q=hilux']) {
        const respuesta = await pedir(q); expect(Array.isArray(respuesta), q + ' -> ' + JSON.stringify(respuesta).slice(0, 200)).toBe(false)
      }
      expect((await pedir('?condicion=0km')).vehiculos.map((v) => v.nombre)).toEqual(['Ford Ranger XLS'])
      expect(Array.isArray(await pedir(''))).toBe(true)
    } finally {
      servidor.close()
    }
  })
})
