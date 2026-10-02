import { describe, it, expect, vi } from 'vitest'

describe('resendEmail.enviarEmail', () => {
  it('llama a la API de Resend con from/to/subject/html', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) })
    const { enviarEmail } = await import('../resendEmail.js')
    await enviarEmail(
      { to: 'bruno@x.com', subject: 'Vence mañana', html: '<p>hola</p>' },
      { fetchImpl, apiKey: 'key123', from: 'Alertas <alertas@neifertautomotores.com>' },
    )
    expect(fetchImpl).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer key123' }),
    }))
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body).toMatchObject({ to: ['bruno@x.com'], subject: 'Vence mañana', html: '<p>hola</p>' })
  })

  it('si la API falla, tira con el mensaje de error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ message: 'dominio no verificado' }) })
    const { enviarEmail } = await import('../resendEmail.js')
    await expect(enviarEmail({ to: 'x@x.com', subject: 's', html: 'h' }, { fetchImpl, apiKey: 'k', from: 'f' }))
      .rejects.toThrow('dominio no verificado')
  })
})
