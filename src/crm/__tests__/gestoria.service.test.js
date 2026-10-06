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

const svc = await import('../services/gestoria.service.js')

beforeEach(() => {
  holder.client = null
  registrar.mockReset().mockResolvedValue(undefined)
})

describe('gestoria.service.guardarCampos', () => {
  it('hace upsert con vehiculo_id + parche y registra evento gestoria', async () => {
    const { client, calls } = makeSupabase({ 'upsert:gestoria': { data: [{}], error: null } })
    holder.client = client
    await svc.guardarCampos('v1', { form08_hecho: true, form08_fecha: '2026-08-30' }, 'u1')
    const up = calls.find((c) => c.table === 'gestoria' && c.op === 'upsert')
    expect(up.payload).toMatchObject({ vehiculo_id: 'v1', form08_hecho: true, form08_fecha: '2026-08-30' })
    expect(up.opts).toMatchObject({ onConflict: 'vehiculo_id' })
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'gestoria', entidadId: 'v1' }))
  })

  it('el evento lista las keys del parche', async () => {
    const { client } = makeSupabase({ 'upsert:gestoria': { data: [{}], error: null } })
    holder.client = client
    await svc.guardarCampos('v1', { titulo_nota: 'ok', titulo_hecho: true }, 'u1')
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({
      datos: { campos: ['titulo_nota', 'titulo_hecho'] },
    }))
  })
})

describe('gestoria.service.listarTodas', () => {
  const dataset = {
    'select:vehiculos': {
      data: [
        {
          id: 'v1', marca: 'VW', modelo: 'Amarok', patente: 'AA1',
          estado: 'disponible', tipo: 'Pickup', fotos: [],
          gestoria: [{
            id: 'g1', vehiculo_id: 'v1', estado: 'en_proceso',
            form08_hecho: true, verif_policial_hecho: true,
          }],
        },
        {
          id: 'v2', marca: 'Ford', modelo: 'Ka', patente: 'BB2',
          estado: 'disponible', tipo: 'Hatchback', fotos: [],
          gestoria: [],
        },
      ],
      error: null,
    },
  }

  it('trae todos los vehículos (salvo baja) ordenados por marca A-Z', async () => {
    const { client, calls } = makeSupabase(dataset)
    holder.client = client
    const r = await svc.listarTodas()
    expect(r.map((g) => [g.vehiculo.id, g.estado])).toEqual([
      ['v1', 'en_proceso'],
      ['v2', 'sin_iniciar'],
    ])
    // el que no tiene fila llega como sin_iniciar sintético
    expect(r[1].id).toBe('sin-v2')
    const c = calls.find((x) => x.table === 'vehiculos')
    expect(c.select).toContain('gestoria(')
    expect(c.filters).toEqual(expect.arrayContaining([['neq', 'estado', 'baja']]))
    const orders = c.filters.filter((f) => f[0] === 'order')
    expect(orders[0]).toEqual(['order', 'marca', { ascending: true }])
    expect(orders.some(([, col]) => col === 'modelo')).toBe(true)
  })

  it('con estado filtra client-side por ese estado', async () => {
    const { client } = makeSupabase(dataset)
    holder.client = client
    const r = await svc.listarTodas({ estado: 'en_proceso' })
    expect(r.map((g) => g.vehiculo.id)).toEqual(['v1'])
  })
})

describe('gestoria.service.obtenerPorVehiculo', () => {
  it('filtra por vehiculo_id y devuelve la fila (maybeSingle)', async () => {
    const { client, calls } = makeSupabase({ 'select:gestoria': { data: { vehiculo_id: 'v1', estado: 'en_proceso' }, error: null } })
    holder.client = client
    const r = await svc.obtenerPorVehiculo('v1')
    expect(r).toMatchObject({ estado: 'en_proceso' })
    expect(calls.find((c) => c.table === 'gestoria').filters).toEqual(
      expect.arrayContaining([['eq', 'vehiculo_id', 'v1']]),
    )
  })
})
