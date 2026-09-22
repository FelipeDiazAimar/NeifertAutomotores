import { describe, it, expect, vi } from 'vitest'

function mockRes() {
  return {
    statusCode: 0, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v },
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
  }
}

const env = { VITE_SUPABASE_URL: 'u', VITE_SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 'k' }

describe('handlePushSubscribe', () => {
  it('405 en métodos que no sean POST', async () => {
    const { handlePushSubscribe } = await import('../../../api/crm/push-subscribe.js')
    const res = mockRes()
    await handlePushSubscribe({ method: 'GET', headers: {} }, res, { env, deps: {} })
    expect(res.statusCode).toBe(405)
  })

  it('401 sin bearer token válido', async () => {
    const { handlePushSubscribe } = await import('../../../api/crm/push-subscribe.js')
    const res = mockRes()
    const deps = { makeAnon: () => ({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } }) }
    await handlePushSubscribe({ method: 'POST', headers: {}, body: {} }, res, { env, deps })
    expect(res.statusCode).toBe(401)
  })

  it('400 si faltan datos de la suscripción', async () => {
    const { handlePushSubscribe } = await import('../../../api/crm/push-subscribe.js')
    const res = mockRes()
    const deps = { makeAnon: () => ({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) } }) }
    await handlePushSubscribe({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: {} }, res, { env, deps })
    expect(res.statusCode).toBe(400)
  })

  it('guarda la suscripción del usuario autenticado', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const deps = {
      makeAnon: () => ({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) } }),
      makeAdmin: () => ({ schema: () => ({ from: () => ({ upsert }) }) }),
    }
    const { handlePushSubscribe } = await import('../../../api/crm/push-subscribe.js')
    const res = mockRes()
    await handlePushSubscribe(
      { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { endpoint: 'https://x/1', p256dh: 'p', auth: 'a' } },
      res,
      { env, deps },
    )
    expect(res.statusCode).toBe(200)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ usuario_id: 'u1', endpoint: 'https://x/1' }),
      expect.objectContaining({ onConflict: 'endpoint' }),
    )
  })
})
