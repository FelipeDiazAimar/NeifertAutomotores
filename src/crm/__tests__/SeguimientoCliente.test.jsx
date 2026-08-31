// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const agregarContacto = { mutate: vi.fn(), isPending: false }
vi.mock('../hooks/useEventos.js', () => ({ useEventos: () => ({ data: [], isLoading: false }) }))
vi.mock('../hooks/useClientes.js', () => ({ useClienteMutations: () => ({ agregarContacto }) }))

const { default: SeguimientoCliente } = await import('../components/SeguimientoCliente.jsx')

describe('SeguimientoCliente', () => {
  it('escribir + "Agregar contacto" llama agregarContacto con el texto', async () => {
    agregarContacto.mutate.mockReset()
    render(<SeguimientoCliente clienteId="c1" />)
    await userEvent.type(screen.getByPlaceholderText(/anotá un contacto/i), 'llamé, interesado')
    await userEvent.click(screen.getByRole('button', { name: /agregar contacto/i }))
    expect(agregarContacto.mutate).toHaveBeenCalledWith('llamé, interesado', expect.any(Object))
  })
})
