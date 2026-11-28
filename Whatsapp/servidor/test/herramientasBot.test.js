import './entorno.js'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { rutasBot } from '../src/bot.js'

// Supabase de mentira (catálogo y contenido de la página); lo que sale hacia la prueba (127.0.0.1) pasa de verdad.
const FILAS = [
  { id: 'a1', marca: 'Toyota', modelo: 'Hilux', version: 'SRX', anio: 2021, km: 60000, combustible: 'Diésel', transmision: 'Manual', moneda: 'USD', precio: 42000, precio_usd: 42000, estado: 'disponible', es_nuevo: false, categoria: 'pickup', imagen_principal: 'https://r2.test/1.png', imagenes: ['https://r2.test/1.png', 'https://r2.test/2.png'], descripcion: '' },
  { id: 'a2', marca: 'Ford', modelo: 'Ranger', version: 'XLS', anio: 2026, km: 0, combustible: 'Diésel', transmision: 'Automática', moneda: 'ARS', precio: 60000000, precio_usd: 50000, estado: 'reservado', es_nuevo: true, categoria: 'pickup', imagen_principal: null, imagenes: [], descripcion: '' },
  { id: 'a3', marca: 'Chevrolet', modelo: 'Tracker', version: 'Premier', anio: 2023, km: 25000, combustible: 'Nafta', transmision: 'Automática', moneda: 'USD', precio: 27000, precio_usd: 27000, estado: 'disponible', es_nuevo: false, categoria: 'suv', imagen_principal: null, imagenes: [], descripcion: '' },
]
const fetchReal = globalThis.fetch
let servidor
let base
const ruta = (fn) => async (req, res) => {
  try {
    res.json(await fn(req))
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
}
const llamar = async (nombre, args, telefono = null) => {
  const r = await fetch(`${base}/herramientas/${nombre}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args, telefono }) })
  return { status: r.status, cuerpo: await r.json() }
}

beforeAll(async () => {
  vi.stubGlobal('fetch', async (url, ...resto) => {
    if (String(url).startsWith('http://127.0.0.1')) return fetchReal(url, ...resto)
    const cuerpo = String(url).includes('contenido_sitio') ? [] : FILAS
    return new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  const app = express()
  app.use(express.json())
  app.use('/api/bot', rutasBot({ ruta, accion: (_n, fn) => ruta(fn) }))
  await new Promise((r) => (servidor = app.listen(0, '127.0.0.1', r)))
  base = `http://127.0.0.1:${servidor.address().port}/api/bot`
})
afterAll(() => {
  servidor.close()
  vi.unstubAllGlobals()
})

describe('herramientas del bot (/api/bot/herramientas)', () => {
  it('GET declara las 5 herramientas y las reglas, dentro de los topes del contrato', async () => {
    const r = await (await fetch(`${base}/herramientas`)).json()
    expect(r.herramientas.map((h) => h.nombre)).toEqual(['buscar_vehiculos', 'ranking_vehiculos', 'consultar_negocio', 'verificar_horario', 'enviar_fotos_vehiculo'])
    for (const h of r.herramientas) {
      expect(h.nombre).toMatch(/^[a-z][a-z0-9_]{0,39}$/)
      expect(h.descripcion.length).toBeLessThanOrEqual(400)
    }
    expect(r.reglas.length).toBeGreaterThan(0)
    expect(r.reglas.length).toBeLessThanOrEqual(10)
    for (const regla of r.reglas) expect(regla.length).toBeLessThanOrEqual(300)
  })

  it('buscar_vehiculos filtra, resume y avisa si la lista es parcial y sin orden', async () => {
    const todos = (await llamar('buscar_vehiculos', {})).cuerpo
    expect(todos.total).toBe(3)
    expect(todos.vehiculos[0]).toMatchObject({ id: 'a1', nombre: 'Toyota Hilux SRX', precio: 'U$S 42.000', condicion: 'usado' })
    expect(todos.vehiculos[0].imagen).toBeUndefined()
    const pickups = (await llamar('buscar_vehiculos', { categoria: 'pickup', disponibles: true })).cuerpo
    expect(pickups.vehiculos.map((v) => v.id)).toEqual(['a1'])
    const parcial = (await llamar('buscar_vehiculos', { limite: 1 })).cuerpo
    expect(parcial).toMatchObject({ total: 3 })
    expect(parcial.nota).toContain('ranking_vehiculos')
    expect((await llamar('buscar_vehiculos', { limite: 1, ordenar: 'precio_asc' })).cuerpo.nota).toBeUndefined()
  })

  it('buscar_vehiculos con abuso (límite 9999, precio negativo, filtros raros, args que no son objeto) no rompe', async () => {
    expect((await llamar('buscar_vehiculos', { limite: 9999 })).cuerpo.vehiculos).toHaveLength(3)
    expect((await llamar('buscar_vehiculos', { limite: -4 })).cuerpo.vehiculos).toHaveLength(1)
    expect((await llamar('buscar_vehiculos', { precioMax: -5 })).cuerpo).toMatchObject({ total: 0, vehiculos: [] })
    expect((await llamar('buscar_vehiculos', { __proto__: 1, constructor: 'x', marca: { a: 1 }, q: 'x'.repeat(5000) })).status).toBe(200)
    expect((await llamar('buscar_vehiculos', 'hola')).cuerpo.total).toBe(3)
  })

  it('ranking_vehiculos ordena (pesos y dólares juntos), acota la cantidad y rechaza criterios inválidos', async () => {
    expect((await llamar('ranking_vehiculos', { criterio: 'mas_barato', cantidad: 1 })).cuerpo.vehiculos.map((v) => v.id)).toEqual(['a3'])
    expect((await llamar('ranking_vehiculos', { criterio: 'mas_caro', cantidad: 1 })).cuerpo.vehiculos.map((v) => v.id)).toEqual(['a2']) // 50.000 USD equivalentes
    expect((await llamar('ranking_vehiculos', { criterio: 'menos_km', condicion: 'usado' })).cuerpo.vehiculos.map((v) => v.id)).toEqual(['a3', 'a1'])
    expect((await llamar('ranking_vehiculos', { criterio: 'mas_nuevo', cantidad: 999 })).cuerpo.vehiculos).toHaveLength(3)
    expect((await llamar('ranking_vehiculos', { criterio: 'mas_nuevo', cantidad: -3 })).cuerpo.vehiculos).toHaveLength(1)
    expect((await llamar('ranking_vehiculos', { criterio: 'el_mejor' })).cuerpo.error).toBe('criterio_invalido')
    expect((await llamar('ranking_vehiculos', {})).cuerpo.error).toBe('criterio_invalido')
  })

  it('consultar_negocio y verificar_horario', async () => {
    const n = (await llamar('consultar_negocio', {})).cuerpo
    expect(n.direccion).toBeTruthy()
    expect(n.horarios).toBeTruthy()
    const a = (await llamar('verificar_horario', { dia: 'mañana', hora: '10:00' })).cuerpo
    expect(typeof a.abierto).toBe('boolean')
    // Argumentos raros: responde igual, sin romperse.
    expect((await llamar('verificar_horario', { dia: 'x'.repeat(500), hora: { a: 1 } })).status).toBe(200)
    expect((await llamar('verificar_horario', {})).status).toBe(200)
  })

  it('enviar_fotos_vehiculo devuelve las rutas y la leyenda; los casos raros dan error claro', async () => {
    const r = (await llamar('enviar_fotos_vehiculo', { id: 'a1', cantidad: 2 })).cuerpo
    expect(r).toMatchObject({ id: 'a1', nombre: 'Toyota Hilux SRX', total: 2 })
    expect(r.imagenes.rutas).toEqual(['/vehiculos/a1/foto/0', '/vehiculos/a1/foto/1'])
    expect(r.imagenes.leyenda).toBe('Toyota Hilux SRX - U$S 42.000')
    expect((await llamar('enviar_fotos_vehiculo', { id: 'a3' })).cuerpo).toEqual({ total: 0, nota: 'Ese auto todavía no tiene fotos cargadas.' })
    const inexistente = { error: 'Ese id no corresponde a un auto del catálogo: buscalo de nuevo con buscar_vehiculos.' }
    expect((await llamar('enviar_fotos_vehiculo', { id: 'nada' })).cuerpo).toEqual(inexistente)
    expect((await llamar('enviar_fotos_vehiculo', { id: '../../etc/passwd' })).cuerpo).toEqual(inexistente)
    expect((await llamar('enviar_fotos_vehiculo', {})).cuerpo.error).toBe('falta_id')
  })

  it('herramienta inexistente: 404 con { error }', async () => {
    const r = await llamar('borrar_todo', {})
    expect(r.status).toBe(404)
    expect(r.cuerpo.error).toContain('borrar_todo')
  })
})
