import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabase } from './_supabaseMock.js'

const holder = vi.hoisted(() => ({ client: null }))
vi.mock('@/services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  get supabase() {
    return holder.client
  },
}))

const svc = await import('../services/usuarios.service.js')

beforeEach(() => {
  holder.client = null
  vi.restoreAllMocks()
})

describe('listar', () => {
  it('trae los campos esperados ordenados por nombre', async () => {
    const { client, calls } = makeSupabase({ 'select:usuarios': { data: [{ id: 'u1' }], error: null } })
    holder.client = client
    const r = await svc.listar()
    expect(r).toEqual([{ id: 'u1' }])
    const c = calls.find((c) => c.table === 'usuarios')
    expect(c.select).toContain('vistas_override')
    expect(c.filters).toEqual(expect.arrayContaining([['order', 'nombre', { ascending: true }]]))
  })
})

describe('actualizarUsuario', () => {
  it('arma el update con el parche y filtra por id', async () => {
    const { client, calls } = makeSupabase({ 'update:usuarios': { data: null, error: null } })
    holder.client = client
    await svc.actualizarUsuario('u1', { rol: 'dueno' })
    const c = calls.find((c) => c.table === 'usuarios')
    expect(c.op).toBe('update')
    expect(c.payload).toEqual({ rol: 'dueno' })
    expect(c.filters).toEqual(expect.arrayContaining([['eq', 'id', 'u1']]))
  })

  it('acepta vistas_override null (restablecer)', async () => {
    const { client, calls } = makeSupabase({ 'update:usuarios': { data: null, error: null } })
    holder.client = client
    await svc.actualizarUsuario('u1', { vistas_override: null })
    expect(calls.find((c) => c.table === 'usuarios').payload).toEqual({ vistas_override: null })
  })
})

describe('guardarRol', () => {
  it('upsert por rol', async () => {
    const { client, calls } = makeSupabase({ 'upsert:roles': { data: null, error: null } })
    holder.client = client
    await svc.guardarRol('vendedor', ['panel'])
    const c = calls.find((c) => c.table === 'roles')
    expect(c.op).toBe('upsert')
    expect(c.payload).toMatchObject({ rol: 'vendedor', vistas_default: ['panel'] })
    expect(c.opts).toEqual({ onConflict: 'rol' })
  })
})

describe('crearUsuario / resetPassword', () => {
  beforeEach(() => {
    holder.client = {
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok-123' } } }) },
    }
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true, id: 'nuevo' }) })
  })

  it('crearUsuario pega a /api/crm/usuarios con bearer y accion crear', async () => {
    await svc.crearUsuario({ usuario: 'Juani', nombre: 'Juani P', rol: 'vendedor', password: 'juani123' })
    expect(global.fetch).toHaveBeenCalledWith('/api/crm/usuarios', expect.objectContaining({ method: 'POST' }))
    const [, opts] = global.fetch.mock.calls[0]
    expect(opts.headers.Authorization).toBe('Bearer tok-123')
    expect(JSON.parse(opts.body)).toEqual({
      accion: 'crear', usuario: 'Juani', nombre: 'Juani P', rol: 'vendedor', password: 'juani123',
    })
  })

  it('resetPassword manda accion reset_password', async () => {
    await svc.resetPassword('u9', 'nuevapass')
    const [, opts] = global.fetch.mock.calls[0]
    expect(JSON.parse(opts.body)).toEqual({ accion: 'reset_password', id: 'u9', password: 'nuevapass' })
  })

  it('propaga el error del endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve({ ok: false, error: 'Ese usuario ya existe' }) })
    await expect(svc.crearUsuario({ usuario: 'x', nombre: 'x', rol: 'vendedor', password: 'x' })).rejects.toThrow('Ese usuario ya existe')
  })
})
