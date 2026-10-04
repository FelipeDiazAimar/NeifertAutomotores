// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const agregarInteres = { mutate: vi.fn(), isPending: false }
const quitarInteres = { mutate: vi.fn() }
vi.mock('../hooks/useClientes.js', () => ({
  useClienteMutations: () => ({ agregarInteres, quitarInteres }),
}))

const { default: InteresesCliente } = await import('../components/InteresesCliente.jsx')

describe('InteresesCliente', () => {
  it('agregar vehículo llama agregarInteres con el shape completo', async () => {
    agregarInteres.mutate.mockReset()
    render(<InteresesCliente clienteId="c1" intereses={[]} />)
    await userEvent.click(screen.getByRole('button', { name: /agregar vehículo/i }))
    await userEvent.type(screen.getByLabelText(/marca/i), 'Nissan')
    await userEvent.type(screen.getByLabelText(/modelo/i), 'Kicks')
    await userEvent.click(screen.getByRole('button', { name: /^agregar$/i }))
    expect(agregarInteres.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ condicion: 'usado', marca: 'Nissan', modelo: 'Kicks' }),
    )
  })

  it('quitar dispara quitarInteres con el id', async () => {
    quitarInteres.mutate.mockReset()
    render(<InteresesCliente clienteId="c1" intereses={[{ id: 5, marca: 'Ford', modelo: 'KA' }]} />)
    await userEvent.click(screen.getByRole('button', { name: /quitar ford/i }))
    expect(quitarInteres.mutate).toHaveBeenCalledWith(5)
  })
})
