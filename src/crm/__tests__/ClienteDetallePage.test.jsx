// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const cliente = { id: 'c1', nombre: 'Ana López', status: 'activo', canal: 'salon', intereses: [], autos_entrega: [] }

vi.mock('../hooks/useClientes.js', () => ({
  useClientes: () => ({ data: { filas: [] }, isLoading: false }),
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
  const SECS = ['datos', 'intereses', 'autos', 'seguimiento', 'tareas', 'historial']
  const LABELS = ['Datos', 'Intereses', 'Autos en entrega', 'Seguimiento', 'Tareas', 'Historial']

  it('la navegación tiene los 6 accesos y todas las secciones se renderizan a la vez', () => {
    renderPage()
    const nav = screen.getByRole('navigation')
    for (const l of LABELS) {
      expect(within(nav).getByRole('button', { name: l })).toBeInTheDocument()
    }
    for (const id of SECS) {
      expect(document.getElementById(id)).toBeInTheDocument()
    }
    // Historial ya visible sin cambiar de "pestaña"
    expect(screen.getByText(/no hay movimientos/i)).toBeInTheDocument()
    expect(screen.getAllByText('Ana López').length).toBeGreaterThan(0)
  })

  it('un acceso de la navegación desplaza a su sección', async () => {
    const scrollIntoView = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Historial' }))
    expect(scrollIntoView).toHaveBeenCalled()
  })
})
