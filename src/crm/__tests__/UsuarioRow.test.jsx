// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UsuarioRow from '../components/UsuarioRow.jsx'

const rolesMap = {
  vendedor: { vistas_default: ['panel', 'clientes', 'vehiculos', 'tareas'] },
  admin: { vistas_default: ['panel', 'clientes', 'vehiculos', 'tareas', 'usuarios', 'roles'] },
}

const base = { id: 'u1', usuario: 'Juani', nombre: 'Juani P', rol: 'vendedor', activo: true, vistas_override: null }

function setup(usuario = base) {
  const onCambiar = vi.fn()
  const onResetPassword = vi.fn()
  render(<UsuarioRow usuario={usuario} rolesMap={rolesMap} onCambiar={onCambiar} onResetPassword={onResetPassword} />)
  return { onCambiar, onResetPassword }
}

describe('UsuarioRow', () => {
  it('sin override muestra "Usando las vistas del rol" y no el botón restablecer', () => {
    setup()
    expect(screen.getByText(/usando las vistas del rol/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /restablecer a las del rol/i })).not.toBeInTheDocument()
  })

  it('togglear una vista llama onCambiar con vistas_override', async () => {
    const { onCambiar } = setup()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Usuarios' }))
    expect(onCambiar).toHaveBeenCalledWith('u1', {
      vistas_override: ['panel', 'clientes', 'vehiculos', 'tareas', 'usuarios'],
    })
  })

  it('con override el botón restablecer llama onCambiar con null', async () => {
    const { onCambiar } = setup({ ...base, vistas_override: ['panel'] })
    await userEvent.click(screen.getByRole('button', { name: /restablecer a las del rol/i }))
    expect(onCambiar).toHaveBeenCalledWith('u1', { vistas_override: null })
  })

  it('el toggle de activo llama onCambiar', async () => {
    const { onCambiar } = setup()
    await userEvent.click(screen.getByRole('switch', { name: 'Activo' }))
    expect(onCambiar).toHaveBeenCalledWith('u1', { activo: false })
  })

  it('resetear contraseña dispara el callback', async () => {
    const { onResetPassword } = setup()
    await userEvent.click(screen.getByRole('button', { name: /resetear contraseña/i }))
    expect(onResetPassword).toHaveBeenCalledWith(base)
  })
})
