import { describe, it, expect, vi } from 'vitest'
import { handleSeedUsuarios } from '../../../api/crm/seed-usuarios.js'

function mockRes() {
  return {
    statusCode: 0, body: null,
    setHeader() {},
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end(b) { this.body = b ?? this.body; return this },
  }
}

const env = { SEED_SECRET: 's', VITE_SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k' }

function fakeAdmin({ existing = [] } = {}) {
  const created = []
  return {
    _created: created,
    auth: {
      admin: {
        listUsers: vi.fn().mockResolvedValue({ data: { users: existing }, error: null }),
        createUser: vi.fn().mockImplementation(async ({ email }) => {
          const u = { id: 'uid-' + email, email }
          created.push(u)
          return { data: { user: u }, error: null }
        }),
        updateUserById: vi.fn().mockResolvedValue({ data: {}, error: null }),
      },
    },
    schema: () => ({
      from: (table) => ({
        upsert: vi.fn().mockReturnValue({ select: () => Promise.resolve({ data: [{}], error: null }) }),
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: table === 'usuarios' ? { id: 7 } : null, error: null }) }) }),
      }),
    }),
  }
}

describe('handleSeedUsuarios', () => {
  it('401 sin secreto', async () => {
    const res = mockRes()
    await handleSeedUsuarios({ method: 'POST', headers: {}, body: {} }, res, { env, deps: { makeAdmin: () => fakeAdmin() } })
    expect(res.statusCode).toBe(401)
  })

  it('405 en GET', async () => {
    const res = mockRes()
    await handleSeedUsuarios({ method: 'GET', headers: { authorization: 'Bearer s' } }, res, { env, deps: { makeAdmin: () => fakeAdmin() } })
    expect(res.statusCode).toBe(405)
  })

  it('crea usuarios nuevos', async () => {
    const res = mockRes()
    const admin = fakeAdmin()
    await handleSeedUsuarios(
      { method: 'POST', headers: { authorization: 'Bearer s' }, body: { usuarios: [{ usuario: 'Bruno', nombre: 'Bruno', rol: 'vendedor', password: 'x' }] } },
      res, { env, deps: { makeAdmin: () => admin } },
    )
    expect(res.statusCode).toBe(200)
    expect(res.body.resultados[0]).toMatchObject({ usuario: 'Bruno', creado: true })
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'bruno@crm-viejo.neifert.local', password: 'x', email_confirm: true,
    }))
  })

  it('actualiza password de usuario existente', async () => {
    const res = mockRes()
    const admin = fakeAdmin({ existing: [{ id: 'uid-1', email: 'bruno@crm-viejo.neifert.local' }] })
    await handleSeedUsuarios(
      { method: 'POST', headers: { authorization: 'Bearer s' }, body: { usuarios: [{ usuario: 'Bruno', nombre: 'Bruno', rol: 'vendedor', password: 'nueva' }] } },
      res, { env, deps: { makeAdmin: () => admin } },
    )
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('uid-1', { password: 'nueva' })
    expect(res.body.resultados[0]).toMatchObject({ usuario: 'Bruno', actualizado: true })
  })

  it('501 sin env de Supabase', async () => {
    const res = mockRes()
    await handleSeedUsuarios(
      { method: 'POST', headers: { authorization: 'Bearer s' }, body: { usuarios: [{ usuario: 'x' }] } },
      res, { env: { SEED_SECRET: 's' }, deps: { makeAdmin: () => fakeAdmin() } },
    )
    expect(res.statusCode).toBe(501)
  })
})
