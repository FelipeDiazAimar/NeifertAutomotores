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
})
