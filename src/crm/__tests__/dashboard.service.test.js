import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabase } from './_supabaseMock.js'

const holder = vi.hoisted(() => ({ client: null }))
vi.mock('@/services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  get supabase() {
    return holder.client
  },
}))

const svc = await import('../services/dashboard.service.js')

beforeEach(() => {
  holder.client = null
})

describe('demanda', () => {
  it('agrupa marcas sin distinguir mayúsculas y corta a 8', async () => {
    const clientes = [
      { marca_interes: 'Ford', tipo_interes: 'Hatchback' },
      { marca_interes: 'ford', tipo_interes: 'SUV' },
      { marca_interes: 'FORD', tipo_interes: null },
      ...Array.from({ length: 12 }, (_, i) => ({ marca_interes: `Marca${i}`, tipo_interes: 'Sedan' })),
    ]
    const { client } = makeSupabase({
      'select:clientes': { data: clientes, error: null },
      'select:cliente_intereses': { data: [], error: null },
    })
    holder.client = client
    const d = await svc.demanda()
    const ford = d.marcas.find((m) => m.nombre.toLowerCase() === 'ford')
    expect(ford.n).toBe(3)
    expect(d.marcas.length).toBeLessThanOrEqual(8)
    expect(d.tipos.find((t) => t.nombre === 'Hatchback').n).toBe(1)
  })
})

describe('kpis', () => {
  it('cuenta con los filtros correctos y suma el stock por moneda', async () => {
    const { client, calls } = makeSupabase({
      'select:clientes': { data: [], error: null, count: 175 },
      'select:tareas': { data: [], error: null, count: 4 },
      'select:vehiculos': (s) =>
        s.select?.includes('precio_contado')
          ? { data: [{ precio_contado: 100, moneda: 'ARS' }, { precio_contado: 5, moneda: 'USD' }], error: null }
          : { data: [], error: null, count: 58 },
    })
    holder.client = client
    const k = await svc.kpis()
    expect(k.clientesActivos).toBe(175)
    expect(k.vehiculosDisponibles).toBe(58)
    expect(k.valorStock).toEqual({ ars: 100, usd: 5 })
    const clientesCall = calls.find((c) => c.table === 'clientes')
    expect(clientesCall.filters).toEqual(expect.arrayContaining([['in', 'status', ['activo', 'en_seguimiento']]]))
  })
})
