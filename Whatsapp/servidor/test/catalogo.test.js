import './entorno.js'
import { describe, expect, it } from 'vitest'

process.env.CRM_URL = 'https://neifert.test/crm/whatsapp'
const a = await import('../src/almacen.js')
const { enviarCatalogoWeb } = await import('../src/whatsapp.js')

describe('catálogo de la página con un toque', () => {
  const CHAT = '5493564111111@s.whatsapp.net'

  it('manda el enlace a /catalogo o /catalogo-0km del dominio del CRM (sin conexión, queda en la bandeja de salida)', async () => {
    a.upsertChat(CHAT, { ultimoTs: 1 })
    const usados = await enviarCatalogoWeb(CHAT, 'usados')
    const ceroKm = await enviarCatalogoWeb(CHAT, '0km')
    expect(usados.enCola).toBe(true)
    const textos = a.listarMensajes(CHAT).map((m) => m.texto)
    expect(textos).toContain('https://neifert.test/catalogo')
    expect(textos).toContain('https://neifert.test/catalogo-0km')
    expect(ceroKm.enCola).toBe(true)
  })

  it('un catálogo que no existe no se manda', () => {
    expect(() => enviarCatalogoWeb(CHAT, 'motos')).toThrow(/desconocido/)
  })
})
