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

const svc = await import('../services/peritajes.service.js')

beforeEach(() => {
  holder.client = null
  registrar.mockReset().mockResolvedValue(undefined)
})

describe('peritajes.service.crear', () => {
  it('calcula el resumen desde datos y registra evento peritaje', async () => {
    const { client, calls } = makeSupabase({ 'insert:peritajes': (s) => ({ data: [{ id: 5, ...s.payload }], error: null }) })
    holder.client = client
    await svc.crear({
      vehiculoId: 'v1',
      datos: { motor: 'ok', frenos: 'falta', abs: 'obs' },
      fecha: '2026-08-30',
      peritadoPor: 'user-1',
    })
    const ins = calls.find((c) => c.table === 'peritajes' && c.op === 'insert')
    expect(ins.payload).toMatchObject({
      vehiculo_id: 'v1', items_ok: 1, items_obs: 1, items_falta: 1, peritado_por: 'user-1',
    })
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({
      entidad: 'vehiculo', entidadId: 'v1', tipo: 'peritaje',
    }))
  })
})

describe('peritajes.service.listarPorVehiculo', () => {
  it('filtra por vehiculo y ordena por fecha desc', async () => {
    const { client, calls } = makeSupabase({ 'select:peritajes': { data: [{ id: 1 }], error: null } })
    holder.client = client
    const r = await svc.listarPorVehiculo('v9')
    expect(r).toEqual([{ id: 1 }])
    const f = calls.find((c) => c.table === 'peritajes').filters
    expect(f).toEqual(expect.arrayContaining([
      ['eq', 'vehiculo_id', 'v9'],
      ['order', 'fecha', { ascending: false }],
    ]))
  })
})

describe('peritajes.service.listarVehiculos', () => {
  const dataset = {
    'select:vehiculos': {
      data: [
        { id: 'v1', marca: 'Toyota', modelo: 'Hilux', patente: 'AA1', estado: 'disponible', peritajes: [] },
        {
          id: 'v2', marca: 'Ford', modelo: 'Ranger', patente: 'BB2', estado: 'disponible',
          peritajes: [{ id: 9, fecha: '2026-06-02', items_ok: 30, items_obs: 0, items_falta: 2 }],
        },
        {
          id: 'v3', marca: 'VW', modelo: 'Amarok', patente: 'CC3', estado: 'disponible',
          peritajes: [{ id: 10, fecha: '2026-06-10', items_ok: 33, items_obs: 0, items_falta: 0 }],
        },
      ],
      error: null,
    },
  }

  it('deriva el estado por vehículo desde el último peritaje', async () => {
    const { client, calls } = makeSupabase(dataset)
    holder.client = client
    const r = await svc.listarVehiculos()
    expect(r.map((f) => [f.vehiculo.id, f.estadoPeritaje])).toEqual([
      ['v1', 'sin_iniciar'],
      ['v2', 'en_proceso'],
      ['v3', 'completo'],
    ])
    const c = calls.find((x) => x.table === 'vehiculos')
    expect(c.select).toContain('peritajes(')
    expect(c.filters).toEqual(expect.arrayContaining([['is', 'archivado_en', null]]))
  })

  it('filtra por estado derivado', async () => {
    const { client } = makeSupabase(dataset)
    holder.client = client
    const r = await svc.listarVehiculos({ estado: 'completo' })
    expect(r.map((f) => f.vehiculo.id)).toEqual(['v3'])
  })

  it('busqueda matchea marca/modelo/patente', async () => {
    const { client } = makeSupabase(dataset)
    holder.client = client
    const r = await svc.listarVehiculos({ busqueda: 'amarok' })
    expect(r.map((f) => f.vehiculo.id)).toEqual(['v3'])
  })
})

describe('peritajes.service.actualizar', () => {
  it('recalcula el resumen, hace update por id y registra evento editado', async () => {
    const { client, calls } = makeSupabase({ 'update:peritajes': (s) => ({ data: [{ id: 7, ...s.payload }], error: null }) })
    holder.client = client
    await svc.actualizar(7, {
      vehiculoId: 'v1',
      datos: { motor: 'ok', frenos: 'ok', abs: 'falta' },
      fecha: '',
      peritadoPor: 'user-2',
    })
    const up = calls.find((c) => c.table === 'peritajes' && c.op === 'update')
    expect(up.payload).toMatchObject({ items_ok: 2, items_falta: 1, fecha: null })
    expect(up.filters).toEqual(expect.arrayContaining([['eq', 'id', 7]]))
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({
      tipo: 'peritaje', datos: expect.objectContaining({ editado: true }),
    }))
  })
})
