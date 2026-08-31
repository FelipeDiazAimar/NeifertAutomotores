import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabase } from './_supabaseMock.js'

const holder = vi.hoisted(() => ({ client: null }))
vi.mock('@/services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  get supabase() {
    return holder.client
  },
}))

const { registrar, listarDeVehiculo, listarDeEntidad } = await import('../services/eventos.service.js')

describe('eventos.service', () => {
  beforeEach(() => {
    holder.client = null
  })

  it('registrar inserta la fila con entidad_id string y datos default', async () => {
    const { client, calls } = makeSupabase({ 'insert:eventos': { data: [{}], error: null } })
    holder.client = client
    await registrar({ entidad: 'vehiculo', entidadId: 123, tipo: 'alta' })
    const call = calls.find((c) => c.table === 'eventos')
    expect(call.op).toBe('insert')
    expect(call.payload).toMatchObject({ entidad: 'vehiculo', entidad_id: '123', tipo: 'alta', datos: {} })
  })

  it('listarDeVehiculo filtra por entidad+id y ordena desc', async () => {
    const { client, calls } = makeSupabase({ 'select:eventos': { data: [{ id: 1 }], error: null } })
    holder.client = client
    const r = await listarDeVehiculo('abc')
    expect(r).toEqual([{ id: 1 }])
    const call = calls.find((c) => c.table === 'eventos')
    expect(call.filters).toEqual(expect.arrayContaining([
      ['eq', 'entidad', 'vehiculo'],
      ['eq', 'entidad_id', 'abc'],
      ['order', 'creado_en', { ascending: false }],
    ]))
  })

  it('listarDeEntidad filtra por la entidad pasada', async () => {
    const { client, calls } = makeSupabase({ 'select:eventos': { data: [], error: null } })
    holder.client = client
    await listarDeEntidad('cliente', 'c1')
    const call = calls.find((c) => c.table === 'eventos')
    expect(call.filters).toEqual(expect.arrayContaining([
      ['eq', 'entidad', 'cliente'],
      ['eq', 'entidad_id', 'c1'],
    ]))
  })
})
