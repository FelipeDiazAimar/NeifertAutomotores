import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabase } from './_supabaseMock.js'

const holder = vi.hoisted(() => ({ client: null }))
vi.mock('@/services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  get supabase() {
    return holder.client
  },
}))

const { deleteMedia } = vi.hoisted(() => ({ deleteMedia: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/media.service', () => ({ deleteMedia }))

const { subir, subirArchivoUnico, borrar } = await import('../services/fotos.service.js')

beforeEach(() => {
  holder.client = null
  vi.restoreAllMocks()
  deleteMedia.mockReset().mockResolvedValue(undefined)
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

describe('fotos.service.borrar', () => {
  it('borra la fila y también el archivo en R2', async () => {
    const { client, calls } = makeSupabase({
      'delete:vehiculo_fotos': { data: null, error: null },
    })
    holder.client = client

    await borrar('foto-1', 'https://pub/x.jpg')

    const del = calls.find((c) => c.table === 'vehiculo_fotos' && c.op === 'delete')
    expect(del).toBeTruthy()
    expect(deleteMedia).toHaveBeenCalledWith('https://pub/x.jpg')
  })

  it('no llama a deleteMedia si no hay url', async () => {
    const { client } = makeSupabase({
      'delete:vehiculo_fotos': { data: null, error: null },
    })
    holder.client = client

    await borrar('foto-1')

    expect(deleteMedia).not.toHaveBeenCalled()
  })
})

describe('fotos.service.subirArchivoUnico', () => {
  it('presigna, sube el archivo y devuelve la URL pública (sin tocar vehiculo_fotos)', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, uploadUrl: 'https://r2/put', publicUrl: 'https://pub/seguro.jpg' }) })
      .mockResolvedValueOnce({ ok: true })

    const file = new File(['x'], 'seguro.jpg', { type: 'image/jpeg' })
    const url = await subirArchivoUnico('crm/gestoria/veh-1', file)

    expect(url).toBe('https://pub/seguro.jpg')
    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, '/api/r2/presign', expect.objectContaining({ method: 'POST' }))
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, 'https://r2/put', expect.objectContaining({ method: 'PUT' }))
  })
})
