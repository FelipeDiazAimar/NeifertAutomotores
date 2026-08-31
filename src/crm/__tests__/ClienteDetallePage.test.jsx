// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const cliente = { id: 'c1', nombre: 'Ana López', status: 'activo', canal: 'salon', intereses: [], autos_entrega: [] }

vi.mock('../hooks/useClientes.js', () => ({
  useCliente: () => ({ data: cliente, isLoading: false }),
  useClienteMutations: () => ({
    cambiarStatus: { mutate: vi.fn() }, archivar: { mutate: vi.fn() }, eliminar: { mutate: vi.fn() },
    agregarInteres: { mutate: vi.fn() }, quitarInteres: { mutate: vi.fn() },
    agregarAutoEntrega: { mutate: vi.fn() }, quitarAutoEntrega: { mutate: vi.fn() },
    agregarContacto: { mutate: vi.fn() }, registrarVenta: { mutate: vi.fn() },
  }),
}))
vi.mock('../hooks/useEventos.js', () => ({ useEventos: () => ({ data: [], isLoading: false }) }))
vi.mock('../hooks/useCrmPerfil.js', () => ({ useCrmPerfil: () => ({ id: 'u1', esAdmin: false }) }))
vi.mock('../hooks/useVehiculos.js', () => ({ useVehiculos: () => ({ data: { filas: [] }, isLoading: false }) }))
vi.mock('../hooks/useTareas.js', () => ({
  useTareas: () => ({ data: [], isLoading: false }),
  useTareaMutations: () => ({
    toggleDone: { mutate: vi.fn() }, archivar: { mutate: vi.fn() }, eliminar: { mutate: vi.fn() },
    crear: { mutate: vi.fn(), isPending: false }, actualizar: { mutate: vi.fn(), isPending: false },
  }),
}))
vi.mock('../hooks/useCrmUsuarios.js', () => ({ useCrmUsuarios: () => ({ data: [] }) }))
vi.mock('lenis/react', () => ({ useLenis: () => null }))

const { default: ClienteDetallePage } = await import('../pages/ClienteDetallePage.jsx')

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/crm/clientes/c1']}>
      <Routes>
        <Route path="/crm/clientes/:id" element={<ClienteDetallePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ClienteDetallePage', () => {
  it('muestra las 6 pestañas y Datos por defecto', () => {
    renderPage()
    for (const t of ['Datos', 'Intereses', 'Autos en entrega', 'Seguimiento', 'Tareas', 'Historial']) {
      expect(screen.getByRole('tab', { name: t })).toBeInTheDocument()
    }
    expect(screen.getAllByText('Ana López').length).toBeGreaterThan(0)
  })

  it('ir a Historial muestra el timeline vacío', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('tab', { name: 'Historial' }))
    expect(await screen.findByText(/no hay movimientos/i)).toBeInTheDocument()
  })
})
