// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const actualizarUsuario = { mutate: vi.fn() }
const crearUsuario = { mutate: vi.fn(), isPending: false }
const resetPassword = { mutate: vi.fn(), isPending: false }

vi.mock('../hooks/useUsuarios.js', () => ({
  useUsuarios: () => ({
    data: [
      { id: 'u1', usuario: 'Bruno', nombre: 'Bruno D', rol: 'vendedor', activo: true, vistas_override: null },
      { id: 'u2', usuario: 'Nico', nombre: 'Nico F', rol: 'admin', activo: true, vistas_override: null },
    ],
    isLoading: false,
  }),
  useRolesCrm: () => ({
    data: [
      { rol: 'vendedor', vistas_default: ['panel', 'clientes', 'vehiculos', 'tareas'] },
      { rol: 'admin', vistas_default: ['panel', 'clientes', 'vehiculos', 'tareas', 'usuarios', 'roles'] },
    ],
  }),
  useUsuarioMutations: () => ({ actualizarUsuario, guardarRol: { mutate: vi.fn() }, crearUsuario, resetPassword }),
}))
vi.mock('lenis/react', () => ({ useLenis: () => null }))

const { default: UsuariosPage } = await import('../pages/UsuariosPage.jsx')

describe('UsuariosPage', () => {
  it('renderiza una fila por usuario', () => {
    render(<MemoryRouter><UsuariosPage /></MemoryRouter>)
    expect(screen.getByText('Bruno D')).toBeInTheDocument()
    expect(screen.getByText('Nico F')).toBeInTheDocument()
  })

  it('"Nuevo usuario" abre el modal', async () => {
    render(<MemoryRouter><UsuariosPage /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: /nuevo usuario/i }))
    expect(await screen.findByRole('dialog', { name: /nuevo usuario/i })).toBeInTheDocument()
  })
})
