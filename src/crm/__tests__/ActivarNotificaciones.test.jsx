// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const activarMock = vi.fn()
vi.mock('@/crm/hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({ activar: activarMock, activando: false, soportado: true }),
}))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } }, isDemo: false }),
}))
const obtenerMiPerfilMock = vi.fn()
vi.mock('@/crm/services/crmUsuarios.service', () => ({
  obtenerMiPerfil: (...args) => obtenerMiPerfilMock(...args),
}))
const guardarMiEmailMock = vi.fn()
vi.mock('@/crm/services/usuarios.service', () => ({
  guardarMiEmail: (...args) => guardarMiEmailMock(...args),
}))

async function renderizar() {
  const { default: ActivarNotificaciones } = await import('../components/ActivarNotificaciones.jsx')
  return render(<ActivarNotificaciones />)
}

describe('ActivarNotificaciones con email', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    guardarMiEmailMock.mockResolvedValue({ ok: true })
  })

  it('si el perfil ya tiene email, activa directo sin modal', async () => {
    obtenerMiPerfilMock.mockResolvedValue({ id: 'u1', email: 'bruno@neifert.com' })
    const usuario = userEvent.setup()
    await renderizar()
    await usuario.click(screen.getByRole('button', { name: /notificaciones/i }))
    await waitFor(() => expect(activarMock).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('si el perfil no tiene email, abre un modal que lo pide', async () => {
    obtenerMiPerfilMock.mockResolvedValue({ id: 'u1', email: null })
    const usuario = userEvent.setup()
    await renderizar()
    await usuario.click(screen.getByRole('button', { name: /notificaciones/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(activarMock).not.toHaveBeenCalled()
  })

  it('email inválido muestra error y no guarda ni activa', async () => {
    obtenerMiPerfilMock.mockResolvedValue({ id: 'u1', email: null })
    const usuario = userEvent.setup()
    await renderizar()
    await usuario.click(screen.getByRole('button', { name: /notificaciones/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    // 'a@b' pasa la validación nativa del input type=email pero no nuestro
    // formato (exigimos punto en el dominio).
    await usuario.type(screen.getByPlaceholderText(/empleado@neifertautomotores/), 'a@b')
    await usuario.click(screen.getByRole('button', { name: /guardar y activar/i }))
    expect(await screen.findByText(/email válido/i)).toBeInTheDocument()
    expect(guardarMiEmailMock).not.toHaveBeenCalled()
    expect(activarMock).not.toHaveBeenCalled()
  })

  it('email válido lo guarda y después activa', async () => {
    obtenerMiPerfilMock.mockResolvedValue({ id: 'u1', email: null })
    const usuario = userEvent.setup()
    await renderizar()
    await usuario.click(screen.getByRole('button', { name: /notificaciones/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await usuario.type(screen.getByPlaceholderText(/empleado@neifertautomotores/), 'bruno@neifert.com')
    await usuario.click(screen.getByRole('button', { name: /guardar y activar/i }))
    await waitFor(() => expect(guardarMiEmailMock).toHaveBeenCalledWith('bruno@neifert.com'))
    await waitFor(() => expect(activarMock).toHaveBeenCalled())
  })
})
