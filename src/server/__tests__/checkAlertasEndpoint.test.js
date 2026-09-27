import { describe, it, expect, vi } from 'vitest'

function mockRes() {
  return { statusCode: 0, body: null, setHeader() {}, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this } }
}
const env = { CRON_SECRET: 's3cr3t', VITE_SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k' }

describe('handleCheckAlertas', () => {
  it('405 en métodos que no sean GET/POST', async () => {
    const { handleCheckAlertas } = await import('../../../api/crm/check-alertas.js')
    const res = mockRes()
    await handleCheckAlertas({ method: 'DELETE', headers: {} }, res, { env, deps: {} })
    expect(res.statusCode).toBe(405)
  })

  it('401 sin el secreto', async () => {
    const { handleCheckAlertas } = await import('../../../api/crm/check-alertas.js')
    const res = mockRes()
    await handleCheckAlertas({ method: 'GET', headers: {} }, res, { env, deps: {} })
    expect(res.statusCode).toBe(401)
  })

  it('a una alerta cuya hora ya llegó le manda push+email y marca notificado', async () => {
    // La alerta es hoy 10:05 (hora Argentina, -03:00 = 13:05 UTC).
    // "Ahora" 10 min después, dentro del margen de tolerancia del cron
    // (corre cada 15-30 min).
    const ahora = new Date('2026-10-02T13:15:00Z')
    const alerta = {
      id: 1, titulo: 'ITV Cronos', fecha: '2026-10-02', hora: '10:05',
      notificado: false, asignado_a: 'u1',
      asignado: { email: 'bruno@x.com' },
    }
    const update = vi.fn().mockResolvedValue({ error: null })
    const enviarPush = vi.fn().mockResolvedValue({ vencidas: [] })
    const enviarEmail = vi.fn().mockResolvedValue({})
    const deps = {
      now: () => ahora,
      cargarAlertasPendientes: vi.fn().mockResolvedValue([alerta]),
      cargarSuscripciones: vi.fn().mockResolvedValue([{ endpoint: 'e1', p256dh: 'p', auth: 'a' }]),
      marcarNotificada: update,
      enviarPush,
      enviarEmail,
      borrarSuscripcionesVencidas: vi.fn(),
    }
    const { handleCheckAlertas } = await import('../../../api/crm/check-alertas.js')
    const res = mockRes()
    await handleCheckAlertas({ method: 'GET', headers: { authorization: 'Bearer s3cr3t' } }, res, { env, deps })

    expect(res.statusCode).toBe(200)
    expect(enviarPush).toHaveBeenCalled()
    expect(enviarEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'bruno@x.com' }))
    expect(update).toHaveBeenCalledWith(1, { notificado: true })
  })

  it('no reenvía una alerta que ya tiene notificado en true', async () => {
    const ahora = new Date('2026-10-02T13:15:00Z')
    const alerta = { id: 1, fecha: '2026-10-02', hora: '10:05', notificado: true, asignado_a: 'u1', asignado: {} }
    const enviarPush = vi.fn()
    const deps = {
      now: () => ahora,
      cargarAlertasPendientes: vi.fn().mockResolvedValue([alerta]),
      cargarSuscripciones: vi.fn().mockResolvedValue([]),
      marcarNotificada: vi.fn(),
      enviarPush, enviarEmail: vi.fn(), borrarSuscripcionesVencidas: vi.fn(),
    }
    const { handleCheckAlertas } = await import('../../../api/crm/check-alertas.js')
    const res = mockRes()
    await handleCheckAlertas({ method: 'GET', headers: { authorization: 'Bearer s3cr3t' } }, res, { env, deps })
    expect(enviarPush).not.toHaveBeenCalled()
  })

  it('una alerta cuya hora todavía no llegó, no dispara nada', async () => {
    const ahora = new Date('2026-10-01T10:00:00Z')
    // es el 2026-10-05 → falta mucho
    const alerta = { id: 2, fecha: '2026-10-05', hora: '10:05', notificado: false, asignado_a: 'u1', asignado: {} }
    const enviarPush = vi.fn()
    const deps = {
      now: () => ahora,
      cargarAlertasPendientes: vi.fn().mockResolvedValue([alerta]),
      cargarSuscripciones: vi.fn().mockResolvedValue([]),
      marcarNotificada: vi.fn(),
      enviarPush, enviarEmail: vi.fn(), borrarSuscripcionesVencidas: vi.fn(),
    }
    const { handleCheckAlertas } = await import('../../../api/crm/check-alertas.js')
    const res = mockRes()
    await handleCheckAlertas({ method: 'GET', headers: { authorization: 'Bearer s3cr3t' } }, res, { env, deps })
    expect(enviarPush).not.toHaveBeenCalled()
  })
})
