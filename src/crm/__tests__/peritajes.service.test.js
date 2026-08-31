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
