import './entorno.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// La base se simula: se anota cada consulta y se contesta lo que el test necesite.
const base = vi.hoisted(() => ({ pools: [], consultas: [], vivas: [] }))

vi.mock('pg', () => {
  class Pool {
    constructor(opciones) {
      this.opciones = opciones
      this.cerrado = false
      this.manejadores = {}
      base.pools.push(this)
    }
    on(evento, fn) {
      this.manejadores[evento] = fn
    }
    async query(sql, params) {
      base.consultas.push({ sql, params })
      if (/^\s*select c\.linea/.test(sql)) return { rows: base.vivas }
      return { rows: [], rowCount: 0 }
    }
    async end() {
      this.cerrado = true
    }
  }
  return { default: { Pool } }
})
vi.mock('../src/config.js', async (original) => ({
  ...(await original()),
  CRM_URL: 'https://www.crm.test',
  LINEA: '5493564000000',
  CLAVE_LINEA: '5493564000000',
  WA_DATABASE_URL: 'postgres://prueba',
}))

const { registrarCrm, renovarConexiones, consultar } = await import('../src/nube.js')

beforeEach(() => {
  base.consultas.length = 0
  base.vivas = []
})

describe('vista sin conexión del CRM', () => {
  it('si otra línea tiene el servidor andando y muestra este CRM, no se lo saca', async () => {
    base.vivas = [{ linea: '5493564999999' }]
    const r = await registrarCrm()
    expect(r).toEqual({ host: 'crm.test', ocupada: '5493564999999' })
    // Solo preguntó: no escribió nada.
    expect(base.consultas).toHaveLength(1)
    const [linea, host, desde] = base.consultas[0].params
    expect([linea, host]).toEqual(['5493564000000', 'crm.test'])
    expect(desde).toBeLessThan(Date.now())
    expect(desde).toBeGreaterThan(Date.now() - 5 * 60e3)
  })

  it('si esa otra línea ya no late, la toma y se la saca', async () => {
    const r = await registrarCrm()
    expect(r).toEqual({ host: 'crm.test', antes: 0 })
    expect(base.consultas.map((c) => c.sql.trim().split(/\s+/)[0])).toEqual(['select', 'insert', 'update'])
  })
})

describe('conexiones con la base', () => {
  it('cierra las conexiones quietas a los 30 s y avisa si una se corta', () => {
    consultar('select 1')
    const pool = base.pools.at(-1)
    expect(pool.opciones).toMatchObject({ idleTimeoutMillis: 30_000, keepAlive: true })
    expect(() => pool.manejadores.error(new Error('Connection terminated'))).not.toThrow()
  })

  it('al volver de una suspensión descarta el pool viejo y abre uno nuevo', async () => {
    await consultar('select 1')
    const viejo = base.pools.at(-1)
    renovarConexiones()
    await consultar('select 2')
    const nuevo = base.pools.at(-1)
    expect(nuevo).not.toBe(viejo)
    expect(viejo.cerrado).toBe(true)
    expect(nuevo.cerrado).toBe(false)
  })
})
