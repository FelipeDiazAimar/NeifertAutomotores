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

  describe('push_subscribe', () => {
    // Cualquier usuario logueado se suscribe a sí mismo — no pasa por el
    // gate de admin/dueno (por eso no usa fakeAdmin(), que solo sirve para
    // las acciones de gestión de usuarios).
    function fakeAdminPush(upsertResult = { error: null }) {
      const upsert = vi.fn().mockResolvedValue(upsertResult)
      return { _upsert: upsert, schema: () => ({ from: () => ({ upsert }) }) }
    }

    it('400 si faltan datos de la suscripción', async () => {
      const res = mockRes()
      await handleUsuarios(
        { method: 'POST', headers: { authorization: 'Bearer x' }, body: { accion: 'push_subscribe' } },
        res, { env, deps: deps(fakeAnon({ id: 'u1' }), fakeAdminPush()) },
      )
      expect(res.statusCode).toBe(400)
    })

    it('guarda la suscripción del usuario autenticado, sin requerir rol admin/dueno', async () => {
      const res = mockRes()
      const admin = fakeAdminPush()
      await handleUsuarios(
        {
          method: 'POST', headers: { authorization: 'Bearer x' },
          body: { accion: 'push_subscribe', endpoint: 'https://x/1', p256dh: 'p', auth: 'a' },
        },
        res, { env, deps: deps(fakeAnon({ id: 'u1' }), admin) },
      )
      expect(res.statusCode).toBe(200)
      expect(admin._upsert).toHaveBeenCalledWith(
        expect.objectContaining({ usuario_id: 'u1', endpoint: 'https://x/1' }),
        expect.objectContaining({ onConflict: 'endpoint' }),
      )
    })
  })

  describe('guardar_mi_email', () => {
    // Cualquier usuario logueado guarda SU propio email — no pasa por el
    // gate de admin/dueno (igual que push_subscribe).
    function fakeAdminEmail(updateResult = { error: null }) {
      const eq = vi.fn().mockResolvedValue(updateResult)
      const update = vi.fn().mockReturnValue({ eq })
      return { _update: update, _eq: eq, schema: () => ({ from: () => ({ update }) }) }
    }

    it('400 si falta el email', async () => {
      const res = mockRes()
      await handleUsuarios(
        { method: 'POST', headers: { authorization: 'Bearer x' }, body: { accion: 'guardar_mi_email' } },
        res, { env, deps: deps(fakeAnon({ id: 'u1' }), fakeAdminEmail()) },
      )
      expect(res.statusCode).toBe(400)
    })

    it('400 si el email es inválido', async () => {
      const res = mockRes()
      await handleUsuarios(
        { method: 'POST', headers: { authorization: 'Bearer x' }, body: { accion: 'guardar_mi_email', email: 'no-es-email' } },
        res, { env, deps: deps(fakeAnon({ id: 'u1' }), fakeAdminEmail()) },
      )
      expect(res.statusCode).toBe(400)
    })

    it('actualiza solo la fila del usuario autenticado, sin requerir rol admin/dueno', async () => {
      const res = mockRes()
      const admin = fakeAdminEmail()
      await handleUsuarios(
        {
          method: 'POST', headers: { authorization: 'Bearer x' },
          body: { accion: 'guardar_mi_email', email: 'bruno@neifert.com' },
        },
        res, { env, deps: deps(fakeAnon({ id: 'u1' }), admin) },
      )
      expect(res.statusCode).toBe(200)
      expect(admin._update).toHaveBeenCalledWith({ email: 'bruno@neifert.com' })
      expect(admin._eq).toHaveBeenCalledWith('id', 'u1')
    })
  })

  describe('disparar_alertas', () => {
    it('403 si el llamador es vendedor', async () => {
      const res = mockRes()
      await handleUsuarios(
        { method: 'POST', headers: { authorization: 'Bearer x' }, body: { accion: 'disparar_alertas' } },
        res, { env, deps: deps(fakeAnon(), fakeAdmin({ callerRow: { rol: 'vendedor', activo: true } })) },
      )
      expect(res.statusCode).toBe(403)
    })

    it('como admin corre la revisión y devuelve su resultado', async () => {
      const res = mockRes()
      const ejecutarChequeo = vi.fn().mockImplementation(async (rq, rs) => {
        expect(rq.headers.authorization).toBe('Bearer s3cr3t')
        rs.status(200).json({ ok: true, enviadas: 2, errores: [] })
      })
      await handleUsuarios(
        { method: 'POST', headers: { authorization: 'Bearer x' }, body: { accion: 'disparar_alertas' } },
        res, { env: { ...env, CRON_SECRET: 's3cr3t' }, deps: { ...deps(fakeAnon(), fakeAdmin()), ejecutarChequeo } },
      )
      expect(ejecutarChequeo).toHaveBeenCalled()
      expect(res.statusCode).toBe(200)
      expect(res.body).toEqual({ ok: true, enviadas: 2, errores: [] })
    })
  })
})
