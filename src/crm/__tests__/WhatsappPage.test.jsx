// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
