import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabase } from './_supabaseMock.js'

const holder = vi.hoisted(() => ({ client: null }))
vi.mock('@/services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  get supabase() {
    return holder.client
  },
}))
const registrar = vi.hoisted(() => vi.fn())
vi.mock('../services/eventos.service.js', () => ({ registrar }))

const svc = await import('../services/vehiculos.service.js')

beforeEach(() => {
  holder.client = null
  registrar.mockReset().mockResolvedValue(undefined)
})

describe('listar', () => {
  it('lista sin filtro de archivados y pagina', async () => {
    const { client, calls } = makeSupabase({ 'select:vehiculos': { data: [{ id: '1' }], error: null, count: 42 } })
    holder.client = client
    const r = await svc.listar({ pagina: 2, pageSize: 20 })
    expect(r).toEqual({ filas: [{ id: '1' }], total: 42 })
    const call = calls.find((c) => c.table === 'vehiculos')
    expect(call.filters).toEqual(expect.arrayContaining([
      ['range', 20, 39],
    ]))
    expect(call.filters.some((f) => f[1] === 'archivado_en')).toBe(false)
    // embebe peritaje + gestoría para las columnas de la tabla
    expect(call.select).toContain('peritajes(')
    expect(call.select).toContain('gestoria(')
  })

  it('busqueda arma el or() sobre varios campos', async () => {
    const { client, calls } = makeSupabase({ 'select:vehiculos': { data: [], error: null, count: 0 } })
    holder.client = client
    await svc.listar({ busqueda: 'hilux' })
    const or = calls.find((c) => c.table === 'vehiculos').filters.find((f) => f[0] === 'or')
    expect(or[1]).toContain('marca.ilike.%hilux%')
    expect(or[1]).toContain('patente.ilike.%hilux%')
  })

  it('ordena por defecto por marca A-Z con desempate por modelo', async () => {
    const { client, calls } = makeSupabase({ 'select:vehiculos': { data: [], error: null, count: 0 } })
    holder.client = client
    await svc.listar({ pagina: 1, pageSize: 20 })
    const orders = calls.find((c) => c.table === 'vehiculos').filters.filter((f) => f[0] === 'order')
    expect(orders[0]).toEqual(['order', 'marca', { ascending: true }])
    expect(orders.some(([, c]) => c === 'modelo')).toBe(true)
  })
})

describe('contarPorEstado', () => {
  it('agrupa por estado e ignora el filtro de estado', async () => {
    const { client, calls } = makeSupabase({
      'select:vehiculos': {
        data: [
          { estado: 'disponible', peritajes: [{ id: 'p1' }], gestoria: { estado: 'completo' } },
          { estado: 'disponible', peritajes: [], gestoria: null },
          { estado: 'reservado', peritajes: [], gestoria: { estado: 'sin_iniciar' } },
          { estado: 'vendido', peritajes: [{ id: 'p2' }], gestoria: { estado: 'en_proceso' } },
          { estado: 'baja', peritajes: [], gestoria: null },
        ],
        error: null,
      },
    })
    holder.client = client
    const r = await svc.contarPorEstado({ busqueda: 'hilux', filtros: { estado: ['disponible'] } })
    expect(r).toEqual({ disponible: 2, reservado: 1, vendido: 1, baja: 1, sinPeritar: 3, sinGestoria: 3 })
    const call = calls.find((c) => c.table === 'vehiculos')
    expect(call.select).toContain('estado')
    expect(call.select).toContain('peritajes(')
    expect(call.select).toContain('gestoria(')
    // aplica búsqueda pero no filtra por estado ni pagina
    expect(call.filters.some((f) => f[0] === 'or')).toBe(true)
    expect(call.filters.some((f) => f[0] === 'in' && f[1] === 'estado')).toBe(false)
    expect(call.filters.some((f) => f[0] === 'range')).toBe(false)
  })

  it('cuenta sinGestoria con gestoria en forma de arreglo', async () => {
    const { client } = makeSupabase({
      'select:vehiculos': {
        data: [
          { estado: 'disponible', peritajes: [], gestoria: [] },
          { estado: 'disponible', peritajes: [], gestoria: [{ estado: 'completo' }] },
        ],
        error: null,
      },
    })
    holder.client = client
    const r = await svc.contarPorEstado({})
    expect(r.sinGestoria).toBe(1)
    expect(r.sinPeritar).toBe(2)
  })
})

describe('crear', () => {
  it('inyecta creado_por y registra evento alta', async () => {
    const { client } = makeSupabase({ 'insert:vehiculos': { data: [{ id: 'v9' }], error: null } })
    holder.client = client
    const r = await svc.crear({ marca: 'Ford', modelo: 'KA' }, 'user-1')
    expect(r).toMatchObject({ id: 'v9' })
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({
      entidad: 'vehiculo', entidadId: 'v9', tipo: 'alta', usuarioId: 'user-1',
    }))
  })
})

describe('cambiarEstado', () => {
  it('registra cambio_estado con {de,a}', async () => {
    const { client } = makeSupabase({ 'update:vehiculos': { data: [{ id: 'v1', estado: 'reservado' }], error: null } })
    holder.client = client
    await svc.cambiarEstado('v1', 'disponible', 'reservado', 'user-1')
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({
      tipo: 'cambio_estado', datos: { de: 'disponible', a: 'reservado' },
    }))
  })
})

describe('eliminar', () => {
  it('eliminar hace delete', async () => {
    const { client, calls } = makeSupabase({ 'delete:vehiculos': { data: [], error: null } })
    holder.client = client
    await svc.eliminar('v1')
    expect(calls.find((c) => c.table === 'vehiculos').op).toBe('delete')
  })
})
