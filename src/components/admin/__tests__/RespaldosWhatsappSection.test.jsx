// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const ITEMS = [
  { tipo: 'nube', ts: '2026-12-03T15:00:00Z', ok: true, chats: 40, mensajes: 9000, bytes: 2_500_000, conArchivos: false, sofia: { chats: 2, mensajes: 8 } },
  { tipo: 'local', ts: '2026-12-02T15:00:00Z', ok: true, chats: 40, mensajes: 8900, usuario: 'Feli', conArchivos: true, cifrado: true },
  { tipo: 'nube', ts: '2026-12-02T03:30:00Z', ok: false, error: 'R2 no responde' }, // 00:30 del 02/12 en Argentina
]
vi.mock('@/crm/services/usuarios.service', () => ({ respaldosWhatsapp: async () => ({ ok: true, items: ITEMS }) }))

const { default: Seccion, diaArgentina } = await import('../RespaldosWhatsappSection.jsx')
const montar = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Seccion />
    </QueryClientProvider>
  )

describe('RespaldosWhatsappSection', () => {
  it('el día se cuenta en hora de Argentina', () => {
    expect(diaArgentina('2026-12-03T02:59:00Z')).toBe('2026-12-02')
    expect(diaArgentina('2026-12-03T03:00:00Z')).toBe('2026-12-03')
  })

  it('lista locales y de la nube con su contenido y los errores', async () => {
    montar()
    expect(await screen.findByText(/Falló: R2 no responde/)).toBeInTheDocument()
    expect(screen.getByText(/Texto y archivos, cifrado/)).toBeInTheDocument()
    expect(screen.getByText(/Solo texto, cifrado/)).toBeInTheDocument()
    expect(screen.getByText(/Charlas de Sofía: 2 chats/)).toBeInTheDocument()
  })

  it('filtra por tipo', async () => {
    montar()
    await screen.findByText(/Falló/)
    await userEvent.click(screen.getByRole('button', { name: 'Locales' }))
    await waitFor(() => expect(screen.queryByText(/Falló/)).not.toBeInTheDocument())
    expect(screen.getByText(/Feli/)).toBeInTheDocument()
  })
})
