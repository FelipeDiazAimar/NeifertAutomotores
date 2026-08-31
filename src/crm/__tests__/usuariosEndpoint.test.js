import { describe, it, expect, vi } from 'vitest'
import { handleUsuarios } from '../../../api/crm/usuarios.js'

function mockRes() {
  return {
    statusCode: 0, body: null,
    setHeader() {},
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end(b) { this.body = b ?? this.body; return this },
  }
}

const env = { VITE_SUPABASE_URL: 'u', VITE_SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 'k' }

function fakeAnon(user = { id: 'caller' }, error = null) {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error }) } }
}

function fakeAdmin({ callerRow = { rol: 'admin', activo: true }, createErr = null } = {}) {
  const createUser = vi.fn().mockImplementation(async ({ email }) => {
    if (createErr) return { data: null, error: { message: createErr } }
    return { data: { user: { id: 'uid-' + email, email } }, error: null }
  })
  const updateUserById = vi.fn().mockResolvedValue({ data: {}, error: null })
  const upsert = vi.fn().mockReturnValue({ select: () => Promise.resolve({ data: [{}], error: null }) })
  return {
    _upsert: upsert,
    auth: { admin: { createUser, updateUserById } },
    schema: () => ({
      from: (table) => ({
        upsert,
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: table === 'usuarios' ? callerRow : null, error: null }) }),
        }),
      }),
    }),
  }
}

const deps = (anon, admin) => ({ makeAnon: () => anon, makeAdmin: () => admin })

describe('handleUsuarios', () => {
  it('405 si no es POST', async () => {
    const res = mockRes()
    await handleUsuarios({ method: 'GET', headers: {} }, res, { env, deps: deps(fakeAnon(), fakeAdmin()) })
    expect(res.statusCode).toBe(405)
  })

  it('401 sin Authorization', async () => {
    const res = mockRes()
    await handleUsuarios({ method: 'POST', headers: {}, body: { accion: 'crear' } }, res, { env, deps: deps(fakeAnon(), fakeAdmin()) })
    expect(res.statusCode).toBe(401)
  })

  it('401 si el token no valida', async () => {
    const res = mockRes()
    await handleUsuarios(
      { method: 'POST', headers: { authorization: 'Bearer x' }, body: { accion: 'crear' } },
      res, { env, deps: deps(fakeAnon(null, { message: 'bad' }), fakeAdmin()) },
    )
    expect(res.statusCode).toBe(401)
  })

  it('403 si el llamador es vendedor', async () => {
    const res = mockRes()
    await handleUsuarios(
      { method: 'POST', headers: { authorization: 'Bearer x' }, body: { accion: 'crear', usuario: 'a', nombre: 'a', rol: 'vendedor', password: 'x' } },
      res, { env, deps: deps(fakeAnon(), fakeAdmin({ callerRow: { rol: 'vendedor', activo: true } })) },
    )
    expect(res.statusCode).toBe(403)
  })

  it('403 si el llamador está inactivo', async () => {
    const res = mockRes()
    await handleUsuarios(
      { method: 'POST', headers: { authorization: 'Bearer x' }, body: { accion: 'crear', usuario: 'a', nombre: 'a', rol: 'vendedor', password: 'x' } },
      res, { env, deps: deps(fakeAnon(), fakeAdmin({ callerRow: { rol: 'admin', activo: false } })) },
    )
    expect(res.statusCode).toBe(403)
  })

  it('crear: createUser con el email sintético + upsert en crm.usuarios', async () => {
    const res = mockRes()
    const admin = fakeAdmin()
    await handleUsuarios(
      { method: 'POST', headers: { authorization: 'Bearer x' }, body: { accion: 'crear', usuario: 'Juani', nombre: 'Juani P', rol: 'vendedor', password: 'juani123' } },
      res, { env, deps: deps(fakeAnon(), admin) },
    )
    expect(res.statusCode).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'juani@crm-viejo.neifert.local', password: 'juani123', email_confirm: true,
    }))
    expect(admin._upsert).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: 'Juani', nombre: 'Juani P', rol: 'vendedor', activo: true }),
      expect.objectContaining({ onConflict: 'id' }),
    )
  })

  it('crear: 409 si el usuario ya existe', async () => {
    const res = mockRes()
    await handleUsuarios(
      { method: 'POST', headers: { authorization: 'Bearer x' }, body: { accion: 'crear', usuario: 'Juani', nombre: 'x', rol: 'vendedor', password: 'x' } },
      res, { env, deps: deps(fakeAnon(), fakeAdmin({ createErr: 'A user with this email address has already been registered' })) },
    )
    expect(res.statusCode).toBe(409)
    expect(res.body.ok).toBe(false)
  })

  it('reset_password: updateUserById', async () => {
    const res = mockRes()
    const admin = fakeAdmin()
    await handleUsuarios(
      { method: 'POST', headers: { authorization: 'Bearer x' }, body: { accion: 'reset_password', id: 'u9', password: 'nueva12345' } },
      res, { env, deps: deps(fakeAnon(), admin) },
    )
    expect(res.statusCode).toBe(200)
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('u9', { password: 'nueva12345' })
  })

  it('400 si la accion es desconocida', async () => {
    const res = mockRes()
    await handleUsuarios(
      { method: 'POST', headers: { authorization: 'Bearer x' }, body: { accion: 'volar' } },
      res, { env, deps: deps(fakeAnon(), fakeAdmin()) },
    )
    expect(res.statusCode).toBe(400)
  })
})
