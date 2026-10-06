// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/crm/services/usuarios.service', () => ({ tokenActual: async () => 'token' }))
vi.mock('@/store/useUiStore', () => ({ useUiStore: (sel) => sel({ theme: 'light' }) }))
vi.stubEnv('VITE_WHATSAPP_PANEL_URL', 'http://localhost:3100')
const { default: WhatsappPage } = await import('../pages/WhatsappPage.jsx')

const montar = () => render(<MemoryRouter><WhatsappPage /></MemoryRouter>)

afterEach(() => vi.unstubAllGlobals())

describe('WhatsappPage', () => {
  it('si el servidor no responde, lo dice en vez de mostrar el error del navegador', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    montar()
    expect(await screen.findByText(/no responde/i)).toBeInTheDocument()
    expect(screen.queryByTitle('WhatsApp de la concesionaria')).toBeNull()
  })

  it('"Reintentar ahora" vuelve a probar y, si responde, carga el panel', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue({})
    vi.stubGlobal('fetch', fetch)
    montar()
    await userEvent.click(await screen.findByRole('button', { name: /reintentar/i }))
    expect(await screen.findByTitle('WhatsApp de la concesionaria')).toHaveAttribute('src', 'http://localhost:3100/')
    expect(fetch).toHaveBeenCalledWith('http://localhost:3100/api/salud', expect.objectContaining({ mode: 'no-cors' }))
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
    await userEvent.click(screen.getByRole('button', { name: /traer chats y grupos/i }))
    expect(postMessage).toHaveBeenCalledWith({ tipo: 'nf-wa:actualizar' }, 'http://localhost:3100')
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
