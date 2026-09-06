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
  it('sin estado no filtra; con estado agrega eq', async () => {
    const { client, calls } = makeSupabase({ 'select:gestoria': { data: [{ id: 1 }], error: null } })
    holder.client = client
    await svc.listarTodas()
    let c = calls.find((x) => x.table === 'gestoria')
    expect(c.select).toContain('vehiculo:vehiculos!inner')
    expect(c.filters).not.toEqual(expect.arrayContaining([['eq', 'estado', 'en_proceso']]))

    const m2 = makeSupabase({ 'select:gestoria': { data: [], error: null } })
    holder.client = m2.client
    await svc.listarTodas({ estado: 'en_proceso' })
    expect(m2.calls.find((x) => x.table === 'gestoria').filters).toEqual(
      expect.arrayContaining([['eq', 'estado', 'en_proceso']]),
    )
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
