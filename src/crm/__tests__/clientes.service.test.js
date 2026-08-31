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

const svc = await import('../services/clientes.service.js')

beforeEach(() => {
  holder.client = null
  registrar.mockReset().mockResolvedValue(undefined)
})

describe('listar', () => {
  it('filtra archivados y arma el or() de búsqueda', async () => {
    const { client, calls } = makeSupabase({ 'select:clientes': { data: [{ id: '1' }], error: null, count: 5 } })
    holder.client = client
    const r = await svc.listar({ busqueda: 'ana', pagina: 1 })
    expect(r).toEqual({ filas: [{ id: '1' }], total: 5 })
    const f = calls.find((c) => c.table === 'clientes').filters
    expect(f).toEqual(expect.arrayContaining([['is', 'archivado_en', null]]))
    expect(f.find((x) => x[0] === 'or')[1]).toContain('nombre.ilike.%ana%')
  })
})

describe('crear', () => {
  it('inyecta creado_por y registra evento alta', async () => {
    const { client } = makeSupabase({ 'insert:clientes': { data: [{ id: 'c9' }], error: null } })
    holder.client = client
    await svc.crear({ nombre: 'Ana' }, 'u1')
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({
      entidad: 'cliente', entidadId: 'c9', tipo: 'alta', usuarioId: 'u1',
    }))
  })
})

describe('registrarVenta', () => {
  it('actualiza cliente y vehículo y registra 2 eventos', async () => {
    const { client, calls } = makeSupabase({
      'update:clientes': { data: [{ id: 'c1' }], error: null },
      'update:vehiculos': { data: [{ id: 'v1' }], error: null },
    })
    holder.client = client
    await svc.registrarVenta('c1', 'v1', 'disponible', 'u1')
    const tablas = calls.filter((c) => c.op === 'update').map((c) => c.table)
    expect(tablas).toEqual(expect.arrayContaining(['clientes', 'vehiculos']))
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ entidad: 'cliente', tipo: 'venta' }))
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ entidad: 'vehiculo', tipo: 'cambio_estado' }))
  })
})

describe('agregarContacto', () => {
  it('registra un evento tipo contacto con el texto', async () => {
    const { client } = makeSupabase()
    holder.client = client
    await svc.agregarContacto('c1', 'llamé, interesado', 'u1')
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({
      entidad: 'cliente', entidadId: 'c1', tipo: 'contacto', datos: { texto: 'llamé, interesado' }, usuarioId: 'u1',
    }))
  })
})
