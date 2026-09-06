// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../hooks/useTareas.js', () => ({
  useTareas: () => ({
    data: [
      { id: 't1', titulo: 'Vencida X', fecha: '2020-01-01', done: false, prioridad: 'normal' },
      { id: 't2', titulo: 'Hoy Y', fecha: new Date().toISOString().slice(0, 10), done: false, prioridad: 'alta' },
      { id: 't3', titulo: 'Hecha Z', fecha: '2020-01-01', done: true, prioridad: 'normal' },
    ],
    isLoading: false,
  }),
  useTareaMutations: () => ({
    toggleDone: { mutate: vi.fn() }, archivar: { mutate: vi.fn() }, eliminar: { mutate: vi.fn() },
    crear: { mutate: vi.fn(), isPending: false }, actualizar: { mutate: vi.fn(), isPending: false },
  }),
  useTareasPendientesHoy: () => ({ data: 0 }),
}))
vi.mock('../hooks/useCrmPerfil.js', () => ({ useCrmPerfil: () => ({ id: 'u1', esAdmin: false }) }))
vi.mock('../hooks/useCrmRealtime.js', () => ({ useCrmRealtime: () => {} }))
vi.mock('../hooks/useCrmUsuarios.js', () => ({ useCrmUsuarios: () => ({ data: [] }) }))
vi.mock('../hooks/useClientes.js', () => ({ useClientes: () => ({ data: { filas: [] } }) }))
vi.mock('../hooks/useVehiculos.js', () => ({ useVehiculos: () => ({ data: { filas: [] } }) }))
vi.mock('lenis/react', () => ({ useLenis: () => null }))

const { default: TareasListPage } = await import('../pages/TareasListPage.jsx')

describe('TareasListPage', () => {
  it('agrupa por vencimiento', () => {
    render(<MemoryRouter><TareasListPage /></MemoryRouter>)
    expect(screen.getByText(/Vencidas · 1/)).toBeInTheDocument()
    expect(screen.getByText(/Hoy · 1/)).toBeInTheDocument()
    expect(screen.getByText('Vencida X')).toBeInTheDocument()
    expect(screen.getByText(/Hechas · 1/)).toBeInTheDocument()
  })

  it('"Nueva tarea" abre el modal', async () => {
    render(<MemoryRouter><TareasListPage /></MemoryRouter>)
    await userEvent.click(screen.getAllByRole('button', { name: /nueva tarea/i })[0])
    expect(await screen.findByLabelText('Título')).toBeInTheDocument()
  })
})
