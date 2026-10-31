// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const estadoHolder = vi.hoisted(() => ({ estado: 'apagadas' }))
const activarMock = vi.hoisted(() => vi.fn())
const desactivarMock = vi.hoisted(() => vi.fn())
vi.mock('../hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    estado: estadoHolder.estado,
    activar: activarMock,
    desactivar: desactivarMock,
    activando: false,
    soportado: true,
  }),
}))

const { default: ActivarNotificaciones } =
  await import('../components/ActivarNotificaciones.jsx')

describe('ActivarNotificaciones', () => {
  beforeEach(() => vi.clearAllMocks())

  it('apagadas: muestra activar y al clicar pide el permiso', async () => {
    estadoHolder.estado = 'apagadas'
    render(<ActivarNotificaciones />)
    const btn = screen.getByRole('button', { name: /activar notificaciones/i })
    expect(btn).toBeInTheDocument()
    await userEvent.click(btn)
    expect(activarMock).toHaveBeenCalled()
    expect(desactivarMock).not.toHaveBeenCalled()
  })

  it('activadas: muestra desactivar y al clicar desuscribe', async () => {
    estadoHolder.estado = 'activadas'
    render(<ActivarNotificaciones />)
    const btn = screen.getByRole('button', { name: /desactivar notificaciones/i })
    await userEvent.click(btn)
    expect(desactivarMock).toHaveBeenCalled()
    expect(activarMock).not.toHaveBeenCalled()
  })

  it('bloqueadas: no pide permiso al clicar', async () => {
    estadoHolder.estado = 'bloqueadas'
    render(<ActivarNotificaciones />)
    await userEvent.click(screen.getByRole('button', { name: /activar notificaciones/i }))
    expect(activarMock).not.toHaveBeenCalled()
    expect(desactivarMock).not.toHaveBeenCalled()
  })
})
