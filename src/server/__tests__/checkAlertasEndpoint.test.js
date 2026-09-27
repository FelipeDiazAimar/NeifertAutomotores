import { describe, it, expect, vi } from 'vitest'

function mockRes() {
  return { statusCode: 0, body: null, setHeader() {}, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this } }
}
const env = { CRON_SECRET: 's3cr3t', VITE_SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k' }

async function correr(alerta, ahora, overrides = {}) {
  const update = vi.fn().mockResolvedValue(undefined)
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
    ...overrides,
  }
  const { handleCheckAlertas } = await import('../../../api/crm/check-alertas.js')
  const res = mockRes()
  await handleCheckAlertas({ method: 'GET', headers: { authorization: 'Bearer s3cr3t' } }, res, { env, deps })
  return { res, update, enviarPush, enviarEmail, deps }
}

const VENCIDA = new Date('2026-10-02T13:15:00Z') // alerta 10:05 AR del 2026-10-02, "ahora" 10 min después
const base = {
  id: 1, titulo: 'ITV Cronos', fecha: '2026-10-02', hora: '10:05',
  notificado_push: false, notificado_email: false, asignado_a: 'u1',
  asignado: { email: 'bruno@x.com' },
}

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

  it('a la hora elegida manda push+email y marca ambos canales', async () => {
    const { res, update, enviarPush, enviarEmail } = await correr({ ...base }, VENCIDA)
    expect(res.statusCode).toBe(200)
    expect(enviarPush).toHaveBeenCalled()
    expect(enviarEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'bruno@x.com' }))
    expect(update).toHaveBeenCalledWith(1, { notificado_push: true, notificado_email: true })
    expect(res.body.enviadas).toBe(1)
  })

  it('no reenvía los canales que ya están marcados', async () => {
    const { enviarPush, enviarEmail, update } = await correr(
      { ...base, notificado_push: true, notificado_email: true }, VENCIDA,
    )
    expect(enviarPush).not.toHaveBeenCalled()
    expect(enviarEmail).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('sin suscripción push, marca el canal web sin enviar y igual manda el email', async () => {
    const { update, enviarPush, enviarEmail } = await correr({ ...base }, VENCIDA, {
      cargarSuscripciones: vi.fn().mockResolvedValue([]),
    })
    expect(enviarPush).not.toHaveBeenCalled()
    expect(enviarEmail).toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith(1, { notificado_push: true, notificado_email: true })
  })

  it('sin email del asignado, marca el canal mail sin enviar y igual manda el push', async () => {
    const { update, enviarPush, enviarEmail } = await correr(
      { ...base, asignado: { email: null } }, VENCIDA,
    )
    expect(enviarPush).toHaveBeenCalled()
    expect(enviarEmail).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith(1, { notificado_push: true, notificado_email: true })
  })

  it('si el push falla, igual intenta el email y registra el error', async () => {
    const { res, update, enviarEmail } = await correr({ ...base }, VENCIDA, {
      enviarPush: vi.fn().mockRejectedValue(new Error('push caído')),
    })
    expect(enviarEmail).toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith(1, { notificado_push: false, notificado_email: true })
    expect(res.body.ok).toBe(false)
    expect(res.body.errores).toHaveLength(1)
  })

  it('una alerta cuya hora todavía no llegó, no dispara nada', async () => {
    const ahora = new Date('2026-10-01T10:00:00Z')
    const { enviarPush, enviarEmail, update } = await correr(
      { ...base, id: 2, fecha: '2026-10-05' }, ahora,
    )
    expect(enviarPush).not.toHaveBeenCalled()
    expect(enviarEmail).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})
