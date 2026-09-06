// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const guardarRol = { mutate: vi.fn() }

vi.mock('../hooks/useUsuarios.js', () => ({
  useRolesCrm: () => ({
    data: [
      { rol: 'vendedor', vistas_default: ['panel', 'clientes'] },
      { rol: 'admin', vistas_default: ['panel', 'clientes', 'vehiculos', 'tareas', 'usuarios', 'roles'] },
      { rol: 'dueno', vistas_default: ['panel', 'clientes', 'vehiculos', 'tareas', 'usuarios', 'roles'] },
    ],
    isLoading: false,
  }),
  useUsuarioMutations: () => ({ guardarRol }),
}))

const { default: RolesPage } = await import('../pages/RolesPage.jsx')

describe('RolesPage', () => {
  it('un acordeón por rol, ordenados admin/dueno/vendedor', () => {
    render(<RolesPage />)
    const titulos = screen.getAllByText(/^(Admin|Dueño|Vendedor)$/).map((n) => n.textContent)
    expect(titulos).toEqual(['Admin', 'Dueño', 'Vendedor'])
  })

  it('al togglear una vista y Guardar llama guardarRol', async () => {
    render(<RolesPage />)
    // abrir el primer acordeón (Admin) y sacar una vista para ensuciar el borrador
    await userEvent.click(screen.getAllByText('Admin')[0])
    const checks = screen.getAllByRole('checkbox', { name: 'Roles' })
    await userEvent.click(checks[0])
    await userEvent.click(screen.getAllByRole('button', { name: /guardar/i })[0])
    expect(guardarRol.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ rol: 'admin' }),
    )
  })
})
