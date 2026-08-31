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
  it('filtra archivados y pagina', async () => {
    const { client, calls } = makeSupabase({ 'select:vehiculos': { data: [{ id: '1' }], error: null, count: 42 } })
    holder.client = client
    const r = await svc.listar({ pagina: 2, pageSize: 20 })
    expect(r).toEqual({ filas: [{ id: '1' }], total: 42 })
    const call = calls.find((c) => c.table === 'vehiculos')
    expect(call.filters).toEqual(expect.arrayContaining([
      ['is', 'archivado_en', null],
      ['range', 20, 39],
    ]))
  })

  it('busqueda arma el or() sobre varios campos', async () => {
    const { client, calls } = makeSupabase({ 'select:vehiculos': { data: [], error: null, count: 0 } })
    holder.client = client
    await svc.listar({ busqueda: 'hilux' })
    const or = calls.find((c) => c.table === 'vehiculos').filters.find((f) => f[0] === 'or')
    expect(or[1]).toContain('marca.ilike.%hilux%')
    expect(or[1]).toContain('patente.ilike.%hilux%')
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

describe('archivar / eliminar', () => {
  it('archivar setea archivado_en no-null y registra evento', async () => {
    const { client, calls } = makeSupabase({ 'update:vehiculos': { data: [{ id: 'v1' }], error: null } })
    holder.client = client
    await svc.archivar('v1', 'user-1')
    const payload = calls.find((c) => c.table === 'vehiculos').payload
    expect(payload.archivado_en).toBeTruthy()
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'archivado' }))
  })

  it('eliminar hace delete', async () => {
    const { client, calls } = makeSupabase({ 'delete:vehiculos': { data: [], error: null } })
    holder.client = client
    await svc.eliminar('v1')
    expect(calls.find((c) => c.table === 'vehiculos').op).toBe('delete')
  })
})
