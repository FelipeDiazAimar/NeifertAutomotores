import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabase } from './_supabaseMock.js'

const holder = vi.hoisted(() => ({ client: null }))
vi.mock('@/services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  get supabase() { return holder.client },
}))

const { listar, crear, actualizar, toggleHecha, eliminar } = await import('../services/alertas.service.js')

beforeEach(() => { holder.client = null })

describe('alertas.service', () => {
  it('listar trae solo pendientes por defecto, ordenadas por fecha/hora', async () => {
    const { client, calls } = makeSupabase({
      'select:alertas': { data: [{ id: 1, titulo: 'ITV Cronos', fecha: '2026-10-01', hora: '10:00' }], error: null },
    })
    holder.client = client
    const filas = await listar()
    expect(filas).toHaveLength(1)
    const sel = calls.find((c) => c.table === 'alertas' && c.op === 'select')
    expect(sel.filters).toContainEqual(['eq', 'hecha', false])
  })

  it('crear inserta con creado_por', async () => {
    const { client, calls } = makeSupabase({
      'insert:alertas': (s) => ({ data: [{ id: 9, ...s.payload }], error: null }),
    })
    holder.client = client
    const fila = await crear({ titulo: 'Llamar a X', fecha: '2026-10-01', hora: '09:00', asignado_a: 'u1' }, 'autor1')
    expect(fila.id).toBe(9)
    const ins = calls.find((c) => c.op === 'insert')
    expect(ins.payload).toMatchObject({ titulo: 'Llamar a X', creado_por: 'autor1' })
  })

  it('actualizar hace update parcial por id', async () => {
    const { client, calls } = makeSupabase({
      'update:alertas': (s) => ({ data: [{ id: 1, ...s.payload }], error: null }),
    })
    holder.client = client
    const fila = await actualizar(1, { titulo: 'Nuevo título' })
    expect(fila.titulo).toBe('Nuevo título')
    const upd = calls.find((c) => c.op === 'update')
    expect(upd.filters).toContainEqual(['eq', 'id', 1])
  })

  it('toggleHecha actualiza el campo hecha', async () => {
    const { client, calls } = makeSupabase({ 'update:alertas': { data: [{ id: 1 }], error: null } })
    holder.client = client
    await toggleHecha(1, true)
    const upd = calls.find((c) => c.op === 'update')
    expect(upd.payload).toEqual({ hecha: true })
  })

  it('eliminar borra por id', async () => {
    const { client, calls } = makeSupabase({ 'delete:alertas': { data: null, error: null } })
    holder.client = client
    await eliminar(1)
    expect(calls.find((c) => c.op === 'delete')).toBeTruthy()
  })
})
