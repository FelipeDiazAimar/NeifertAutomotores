import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabase } from './_supabaseMock.js'

const holder = vi.hoisted(() => ({ client: null }))
vi.mock('@/services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  get supabase() {
    return holder.client
  },
}))

const svc = await import('../services/opcionesCampo.service.js')

beforeEach(() => {
  holder.client = null
})

describe('listar', () => {
  it('une valores de vehiculos y del catalogo, dedup sin distinguir mayusculas y ordena', async () => {
    const { client } = makeSupabase({
      'select:vehiculos': {
        data: [
          { marca: 'Ford', modelo: 'KA' },
          { marca: 'ford', modelo: 'Ranger' },
          { marca: 'Toyota', modelo: null },
        ],
        error: null,
      },
      'select:opciones_campo': {
        data: [
          { campo: 'marca', valor: 'Mazda' },
          { campo: 'marca', valor: 'FORD' },
          { campo: 'color', valor: 'Rojo' },
        ],
        error: null,
      },
    })
    holder.client = client

    const r = await svc.listar()
    expect(r.marca).toEqual(['Ford', 'Mazda', 'Toyota'])
    expect(r.modelo).toEqual(['KA', 'Ranger'])
    expect(r.color).toEqual(['Rojo'])
    expect(r.origen).toEqual([])
  })

  it('si el catalogo no existe todavia usa solo lo derivado de vehiculos', async () => {
    const { client } = makeSupabase({
      'select:vehiculos': { data: [{ marca: 'Fiat' }], error: null },
      'select:opciones_campo': { data: null, error: { message: 'relation does not exist' } },
    })
    holder.client = client

    const r = await svc.listar()
    expect(r.marca).toEqual(['Fiat'])
  })

  it('propaga el error si falla la consulta de vehiculos', async () => {
    const { client } = makeSupabase({
      'select:vehiculos': { data: null, error: { message: 'boom' } },
    })
    holder.client = client
    await expect(svc.listar()).rejects.toMatchObject({ message: 'boom' })
  })
})

describe('registrar', () => {
  it('hace upsert de los valores validos ignorando duplicados', async () => {
    const { client, calls } = makeSupabase({ 'upsert:opciones_campo': { data: [], error: null } })
    holder.client = client

    await svc.registrar([
      { campo: 'marca', valor: '  Mazda  ' },
      { campo: 'inexistente', valor: 'x' },
      { campo: 'color', valor: '' },
    ])

    const call = calls.find((c) => c.table === 'opciones_campo')
    expect(call.op).toBe('upsert')
    expect(call.payload).toEqual([{ campo: 'marca', valor: 'Mazda' }])
    expect(call.opts).toMatchObject({ ignoreDuplicates: true })
  })

  it('no llama a supabase si no hay entradas validas', async () => {
    const { client, calls } = makeSupabase()
    holder.client = client
    await svc.registrar([{ campo: 'marca', valor: '   ' }])
    expect(calls).toHaveLength(0)
  })

  it('no propaga el error del upsert (tabla ausente no debe romper el guardado)', async () => {
    const { client } = makeSupabase({
      'upsert:opciones_campo': { data: null, error: { message: 'relation does not exist' } },
    })
    holder.client = client
    await expect(svc.registrar([{ campo: 'marca', valor: 'Mazda' }])).resolves.toBeUndefined()
  })
})
