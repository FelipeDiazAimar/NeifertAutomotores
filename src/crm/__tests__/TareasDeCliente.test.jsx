// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../hooks/useTareas.js', () => ({
  useTareas: () => ({
    data: [{ id: 't1', titulo: 'Traer el 08', fecha: '2026-09-01', done: false, prioridad: 'normal' }],
    isLoading: false,
  }),
  useTareaMutations: () => ({
    toggleDone: { mutate: vi.fn() }, archivar: { mutate: vi.fn() }, eliminar: { mutate: vi.fn() },
    crear: { mutate: vi.fn(), isPending: false }, actualizar: { mutate: vi.fn(), isPending: false },
  }),
}))
vi.mock('../hooks/useCrmPerfil.js', () => ({ useCrmPerfil: () => ({ id: 'u1', esAdmin: false }) }))
vi.mock('../hooks/useCrmUsuarios.js', () => ({ useCrmUsuarios: () => ({ data: [] }) }))
vi.mock('../hooks/useClientes.js', () => ({ useClientes: () => ({ data: { filas: [] } }) }))
vi.mock('../hooks/useVehiculos.js', () => ({ useVehiculos: () => ({ data: { filas: [] } }) }))
vi.mock('lenis/react', () => ({ useLenis: () => null }))

const { default: TareasDeCliente } = await import('../components/TareasDeCliente.jsx')

describe('TareasDeCliente', () => {
  it('lista las tareas del cliente y abre el modal', async () => {
    render(<MemoryRouter><TareasDeCliente clienteId="c1" /></MemoryRouter>)
    expect(screen.getByText('Traer el 08')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /nueva tarea/i }))
    expect(await screen.findByLabelText('Título')).toBeInTheDocument()
  })
})
