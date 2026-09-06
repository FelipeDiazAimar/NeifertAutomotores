import { describe, it, expect, vi } from 'vitest'
import { handleSyncLegacy } from '../../../../api/crm/sync-legacy.js'

function mockRes() {
  return {
    statusCode: 0, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v },
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end(b) { this.body = b ?? this.body; return this },
  }
}

const env = { CRON_SECRET: 's3cr3t', VITE_SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k', CRM_SYNC_USER: 'x', CRM_SYNC_PASS: 'y' }

describe('handleSyncLegacy', () => {
  it('405 on GET', async () => {
    const res = mockRes()
    await handleSyncLegacy({ method: 'GET', headers: {} }, res, { env, runner: vi.fn() })
    expect(res.statusCode).toBe(405)
  })

  it('401 without the bearer secret', async () => {
    const res = mockRes()
    await handleSyncLegacy({ method: 'POST', headers: {} }, res, { env, runner: vi.fn() })
    expect(res.statusCode).toBe(401)
  })

  it('runs the sync and returns its result', async () => {
    const res = mockRes()
    const runner = vi.fn().mockResolvedValue({ ok: true, runId: 5, estado: 'ok' })
    await handleSyncLegacy({ method: 'POST', headers: { authorization: 'Bearer s3cr3t' } }, res, { env, runner })
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ supabaseUrl: 'u', serviceRoleKey: 'k', crmUser: 'x', disparadoPor: 'cron' }))
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, run: { ok: true, runId: 5, estado: 'ok' } })
  })

  it('501 when env is missing', async () => {
    const res = mockRes()
    await handleSyncLegacy(
      { method: 'POST', headers: { authorization: 'Bearer s3cr3t' } },
      res,
      { env: { CRON_SECRET: 's3cr3t' }, runner: vi.fn() },
    )
    expect(res.statusCode).toBe(501)
  })
})
