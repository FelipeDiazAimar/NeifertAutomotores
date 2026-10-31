import { describe, it, expect, vi } from 'vitest'

describe('resendEmail.enviarEmail', () => {
  it('llama a la API de Resend con from/to/subject/html', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) })
    const { enviarEmail } = await import('../resendEmail.js')
    await enviarEmail(
      { to: 'bruno@x.com', subject: 'Vence mañana', html: '<p>hola</p>' },
      { fetchImpl, apiKey: 'key123', from: 'Alertas <alertas@neifertautomotores.com>' }
    )
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer key123' }),
      })
    )
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body).toMatchObject({
      to: ['bruno@x.com'],
      subject: 'Vence mañana',
      html: '<p>hola</p>',
    })
  })

  it('si la API falla, tira con el mensaje de error', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ message: 'dominio no verificado' }),
      })
    const { enviarEmail } = await import('../resendEmail.js')
    await expect(
      enviarEmail(
        { to: 'x@x.com', subject: 's', html: 'h' },
        { fetchImpl, apiKey: 'k', from: 'f' }
      )
    ).rejects.toThrow('dominio no verificado')
  })
})

describe('resendEmail logo inline', () => {
  it('adjunta el logo embebido cuando el html lo referencia', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) })
    const { enviarEmail, htmlAlerta } = await import('../resendEmail.js')
    await enviarEmail(
      { to: 'a@x.com', subject: 's', html: htmlAlerta({ titulo: 't' }) },
      { fetchImpl, apiKey: 'k', from: 'f' }
    )
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.attachments[0]).toMatchObject({ content_id: 'logo-neifert' })
    expect(body.attachments[0].content.length).toBeGreaterThan(1000)
  })
})

describe('resendEmail.htmlAlerta', () => {
  it('incluye el logo y escapa el contenido', async () => {
    const { htmlAlerta } = await import('../resendEmail.js')
    const html = htmlAlerta({
      titulo: 'ITV <Cronos>',
      descripcion: 'Vence "mañana"\nNo olvidar',
    })
    expect(html).toContain('src="cid:logo-neifert"')
    expect(html).toContain('ITV &lt;Cronos&gt;')
    expect(html).toContain('Vence &quot;mañana&quot;<br>No olvidar')
    expect(html).not.toContain('<Cronos>')
  })

  it('sin descripción no agrega párrafo vacío', async () => {
    const { htmlAlerta } = await import('../resendEmail.js')
    const html = htmlAlerta({ titulo: 'Aviso', descripcion: null })
    expect(html).toContain('Aviso')
    expect(html).not.toContain('color:#333')
  })
})
