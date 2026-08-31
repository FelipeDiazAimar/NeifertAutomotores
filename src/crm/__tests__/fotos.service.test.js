import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabase } from './_supabaseMock.js'

const holder = vi.hoisted(() => ({ client: null }))
vi.mock('@/services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  get supabase() {
    return holder.client
  },
}))

const { subir } = await import('../services/fotos.service.js')

beforeEach(() => {
  holder.client = null
  vi.restoreAllMocks()
})

describe('fotos.service.subir', () => {
  it('presign → PUT → insert con la URL pública y el orden siguiente', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, uploadUrl: 'https://r2/put', publicUrl: 'https://pub/x.jpg' }) })
      .mockResolvedValueOnce({ ok: true })
    const { client, calls } = makeSupabase({
      'select:vehiculo_fotos': { data: [{ orden: 2 }], error: null },
      'insert:vehiculo_fotos': (s) => ({ data: [{ id: 9, ...s.payload }], error: null }),
    })
    holder.client = client

    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    const fila = await subir('veh-1', file, 'user-1')

    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, '/api/r2/presign', expect.objectContaining({ method: 'POST' }))
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, 'https://r2/put', expect.objectContaining({ method: 'PUT' }))
    const ins = calls.find((c) => c.table === 'vehiculo_fotos' && c.op === 'insert')
    expect(ins.payload).toMatchObject({ vehiculo_id: 'veh-1', url: 'https://pub/x.jpg', orden: 3, subida_por: 'user-1' })
    expect(fila.id).toBe(9)
  })
})
