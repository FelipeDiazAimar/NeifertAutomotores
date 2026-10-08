// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/crm/services/usuarios.service', () => ({ tokenActual: async () => 'token' }))
vi.mock('@/store/useUiStore', () => ({ useUiStore: (sel) => sel({ theme: 'light' }) }))
vi.stubEnv('VITE_WHATSAPP_PANEL_URL', 'http://localhost:3100')
const { default: WhatsappPage } = await import('../pages/WhatsappPage.jsx')

const montar = () => render(<MemoryRouter><WhatsappPage /></MemoryRouter>)

/**
 * fetch de mentira: la función del CRM (/wa-lectura/api/servidor) contesta, en orden, si
 * la PC servidor responde (la última respuesta se repite). Lo demás contesta vacío.
 */
const servidorQue = (...respuestas) => {
  const cola = [...respuestas]
  return vi.fn(async (url) => {
    if (String(url).startsWith('/wa-lectura/api/servidor')) {
      const responde = cola.length > 1 ? cola.shift() : cola[0]
      return { json: async () => ({ responde }) }
    }
    return {}
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('WhatsappPage', () => {
  it('si el servidor no responde, abre el WhatsApp en solo lectura (los chats guardados en la base)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    montar()
    const lectura = await screen.findByTitle('WhatsApp de la concesionaria (solo lectura)')
    expect(lectura).toHaveAttribute('src', '/wa-lectura/index.html')
    expect(screen.queryByTitle('WhatsApp de la concesionaria')).toBeNull()

    // La copia de solo lectura es del mismo sitio que el CRM: se le habla con ese origen.
    const panel = lectura.contentWindow
    const postMessage = vi.spyOn(panel, 'postMessage')
    const delPanel = (data) =>
      act(() => window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: panel, data: { origen: 'nf-wa', ...data } })))
    await delPanel({ tipo: 'nf-wa:pedir-token' })
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith({ tipo: 'nf-wa:token', token: 'token' }, window.location.origin))
    await delPanel({ tipo: 'nf-wa:listo' })
    await delPanel({ tipo: 'nf-wa:estado', conexion: 'nube', clase: 'wait', texto: 'Solo lectura', vista: 'inbox', hayLinea: true, puedeActualizar: false })
    expect(screen.getByText(/solo lectura · servidor apagado/i)).toBeInTheDocument()
    // En solo lectura no hay pestañas: Conexión no sirve con la PC apagada.
    expect(screen.queryByRole('tab', { name: 'Conexión' })).toBeNull()
  })

  it('con la PC apagada Cloudflare igual contesta: si la función dice que no responde, va a solo lectura', async () => {
    // La pregunta directa "llegaría" (Cloudflare devuelve su página de error), pero no cuenta.
    vi.stubGlobal('fetch', servidorQue(false))
    montar()
    expect(await screen.findByTitle('WhatsApp de la concesionaria (solo lectura)')).toBeInTheDocument()
    expect(screen.queryByTitle('WhatsApp de la concesionaria')).toBeNull()
    // Mientras carga hay un aviso, no un cuadro gris.
    expect(screen.getByText(/el servidor de whatsapp está apagado/i)).toBeInTheDocument()
  })

  it('"Reintentar" vuelve a probar y, si la PC servidor ya responde, carga el panel normal', async () => {
    const fetch = servidorQue(false, true)
    vi.stubGlobal('fetch', fetch)
    montar()
    const lectura = await screen.findByTitle('WhatsApp de la concesionaria (solo lectura)')
    const panel = lectura.contentWindow
    await act(() =>
      window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: panel, data: { origen: 'nf-wa', tipo: 'nf-wa:listo' } })),
    )
    await act(() =>
      window.dispatchEvent(
        new MessageEvent('message', { origin: window.location.origin, source: panel, data: { origen: 'nf-wa', tipo: 'nf-wa:estado', conexion: 'nube', vista: 'inbox', hayLinea: true } }),
      ),
    )
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }))
    expect(await screen.findByTitle('WhatsApp de la concesionaria')).toHaveAttribute('src', 'http://localhost:3100/')
    expect(fetch).toHaveBeenCalledWith('/wa-lectura/api/servidor', expect.objectContaining({ cache: 'no-store' }))
  })

  it('con la PC apagada sigue probando sola y pasa al panel normal cuando vuelve', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetch = servidorQue(false, false, true)
    vi.stubGlobal('fetch', fetch)
    montar()
    expect(await screen.findByTitle('WhatsApp de la concesionaria (solo lectura)')).toBeInTheDocument()
    // Primer reintento: sigue apagada, la lectura no se cierra.
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    expect(screen.getByTitle('WhatsApp de la concesionaria (solo lectura)')).toBeInTheDocument()
    // Segundo: ya responde.
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    expect(await screen.findByTitle('WhatsApp de la concesionaria')).toHaveAttribute('src', 'http://localhost:3100/')
  })

  it('el encabezado (pestañas, estado y actualizar) lo dibuja el CRM con lo que avisa el panel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({}))
    montar()
    const iframe = await screen.findByTitle('WhatsApp de la concesionaria')
    const panel = iframe.contentWindow
    const postMessage = vi.spyOn(panel, 'postMessage')
    const delPanel = (data) =>
      act(() => window.dispatchEvent(new MessageEvent('message', { origin: 'http://localhost:3100', source: panel, data: { origen: 'nf-wa', ...data } })))

    await delPanel({ tipo: 'nf-wa:listo' })
    await delPanel({ tipo: 'nf-wa:estado', conexion: 'conectado', clase: '', texto: 'Conectada', telefono: '5493406518585', vista: 'inbox', hayLinea: true, puedeActualizar: true, actualizarHabilitado: true, actualizando: false })

    expect(screen.getByRole('tab', { name: 'Bandeja' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('+54 9 3406518585')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Conexión' }))
    expect(postMessage).toHaveBeenCalledWith({ tipo: 'nf-wa:vista', vista: 'connect' }, 'http://localhost:3100')
    await userEvent.click(screen.getByRole('button', { name: 'Recargar' }))
    expect(postMessage).toHaveBeenCalledWith({ tipo: 'nf-wa:actualizar' }, 'http://localhost:3100')
  })

  it('si el panel nunca termina de cargar, vuelve a probar en vez de quedar cargando', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetch = servidorQue(true)
    vi.stubGlobal('fetch', fetch)
    const pruebas = () => fetch.mock.calls.filter(([url]) => url === '/wa-lectura/api/servidor').length
    montar()
    await screen.findByTitle('WhatsApp de la concesionaria')
    expect(pruebas()).toBe(1)
    await act(() => vi.advanceTimersByTimeAsync(25_000))
    await waitFor(() => expect(pruebas()).toBe(2))
  })

  it('un mensaje que no viene del panel no cambia nada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({}))
    montar()
    const panel = (await screen.findByTitle('WhatsApp de la concesionaria')).contentWindow
    for (const tipo of ['nf-wa:listo', 'nf-wa:estado']) {
      const data = { origen: 'nf-wa', tipo, conexion: 'conectado', vista: 'inbox', hayLinea: true }
      await act(() => window.dispatchEvent(new MessageEvent('message', { origin: 'https://otro.com', source: panel, data })))
    }
    expect(screen.queryByRole('tab', { name: 'Bandeja' })).toBeNull()
  })
})
