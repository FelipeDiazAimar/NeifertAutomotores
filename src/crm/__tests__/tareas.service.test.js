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

const svc = await import('../services/tareas.service.js')

beforeEach(() => {
  holder.client = null
  registrar.mockReset().mockResolvedValue(undefined)
})

describe('listar', () => {
  it('sin incluirHechas/archivadas filtra done=false y archivado_en null', async () => {
    const { client, calls } = makeSupabase({ 'select:tareas': { data: [], error: null } })
    holder.client = client
    await svc.listar({})
    const f = calls.find((c) => c.table === 'tareas').filters
    expect(f).toEqual(expect.arrayContaining([['eq', 'done', false], ['is', 'archivado_en', null]]))
  })

  it('filtro clienteId', async () => {
    const { client, calls } = makeSupabase({ 'select:tareas': { data: [], error: null } })
    holder.client = client
    await svc.listar({ filtros: { clienteId: 'c1' }, incluirHechas: true })
    const f = calls.find((c) => c.table === 'tareas').filters
    expect(f).toEqual(expect.arrayContaining([['eq', 'cliente_id', 'c1']]))
    expect(f).not.toEqual(expect.arrayContaining([['eq', 'done', false]]))
  })
})

describe('crear', () => {
  it('con cliente_id registra evento en el cliente', async () => {
    const { client } = makeSupabase({ 'insert:tareas': { data: [{ id: 't1', cliente_id: 'c1', titulo: 'X' }], error: null } })
    holder.client = client
    await svc.crear({ titulo: 'X', fecha: '2026-09-01', cliente_id: 'c1' }, 'u1')
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ entidad: 'cliente', entidadId: 'c1', tipo: 'tarea' }))
  })

  it('sin cliente ni vehículo NO registra evento', async () => {
    const { client } = makeSupabase({ 'insert:tareas': { data: [{ id: 't2', titulo: 'suelta' }], error: null } })
    holder.client = client
    await svc.crear({ titulo: 'suelta', fecha: '2026-09-01' }, 'u1')
    expect(registrar).not.toHaveBeenCalled()
  })
})

describe('toggleDone', () => {
  it('actualiza done', async () => {
    const { client, calls } = makeSupabase({ 'update:tareas': { data: [{ id: 't1', done: true }], error: null } })
    holder.client = client
    await svc.toggleDone('t1', true, 'u1')
    const call = calls.find((c) => c.table === 'tareas' && c.op === 'update')
    expect(call.payload).toMatchObject({ done: true })
  })
})

describe('contarPendientesHoy', () => {
  it('filtra done=false, fecha<=hoy, asignado_a', async () => {
    const { client, calls } = makeSupabase({ 'select:tareas': { data: [], error: null, count: 4 } })
    holder.client = client
    const n = await svc.contarPendientesHoy('u1')
    expect(n).toBe(4)
    const f = calls.find((c) => c.table === 'tareas').filters
    expect(f).toEqual(expect.arrayContaining([['eq', 'done', false], ['eq', 'asignado_a', 'u1']]))
    expect(f.find((x) => x[0] === 'lte')).toBeTruthy()
  })
})
