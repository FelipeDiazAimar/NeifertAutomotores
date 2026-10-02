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

const { subirArchivoUnico } = vi.hoisted(() => ({ subirArchivoUnico: vi.fn() }))
vi.mock('../services/fotos.service.js', () => ({ subirArchivoUnico }))

const svc = await import('../services/gestoriaFotos.service.js')

beforeEach(() => {
  holder.client = null
  deleteMedia.mockReset().mockResolvedValue(undefined)
  subirArchivoUnico.mockReset().mockResolvedValue('https://pub/seguro-1.jpg')
})

describe('gestoriaFotos.service.listar', () => {
  it('filtra por vehículo y slot, ordena por orden asc', async () => {
    const { client, calls } = makeSupabase({ 'select:gestoria_fotos': { data: [], error: null } })
    holder.client = client
    await svc.listar('v1', 'seguro')
    const q = calls.find((c) => c.table === 'gestoria_fotos')
    expect(q.filters).toEqual(expect.arrayContaining([
      ['eq', 'vehiculo_id', 'v1'],
      ['eq', 'slot', 'seguro'],
      ['order', 'orden', { ascending: true }],
    ]))
  })
})

describe('gestoriaFotos.service.agregar', () => {
  it('sube a R2 e inserta al final SIN límite de cantidad', async () => {
    const { client, calls } = makeSupabase({
      'select:gestoria_fotos': { data: [{ orden: 4 }], error: null },
      'insert:gestoria_fotos': (s) => ({ data: [{ id: 'f9', ...s.payload }], error: null }),
    })
    holder.client = client
    const file = new File(['x'], 'seguro.jpg', { type: 'image/jpeg' })
    const fila = await svc.agregar('v1', 'seguro', file)
    expect(subirArchivoUnico).toHaveBeenCalledWith('crm/gestoria/v1/seguro', file)
    const ins = calls.find((c) => c.table === 'gestoria_fotos' && c.op === 'insert')
    expect(ins.payload).toMatchObject({ vehiculo_id: 'v1', slot: 'seguro', url: 'https://pub/seguro-1.jpg', orden: 5 })
    expect(fila.id).toBe('f9')
  })

  it('rechaza slots desconocidos', async () => {
    const { client } = makeSupabase({})
    holder.client = client
    await expect(svc.agregar('v1', 'inventado', new File(['x'], 'a.jpg'))).rejects.toThrow('Slot desconocido')
  })
})

describe('gestoriaFotos.service.borrar', () => {
  it('borra la fila y el archivo en R2', async () => {
    const { client, calls } = makeSupabase({ 'delete:gestoria_fotos': { data: null, error: null } })
    holder.client = client
    await svc.borrar('f1', 'https://pub/seguro-1.jpg')
    expect(calls.find((c) => c.table === 'gestoria_fotos' && c.op === 'delete')).toBeTruthy()
    expect(deleteMedia).toHaveBeenCalledWith('https://pub/seguro-1.jpg')
  })
})
