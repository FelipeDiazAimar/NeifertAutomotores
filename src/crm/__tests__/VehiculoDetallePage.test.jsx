// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const vehiculo = { id: 'v1', marca: 'Toyota', modelo: 'Hilux', estado: 'disponible', fotos: [] }

vi.mock('../hooks/useVehiculos.js', () => ({
  useVehiculo: () => ({ data: vehiculo, isLoading: false }),
  useVehiculoMutations: () => ({
    cambiarEstado: { mutate: vi.fn() }, archivar: { mutate: vi.fn() }, eliminar: { mutate: vi.fn() },
  }),
}))
const peritajesHolder = vi.hoisted(() => ({ data: [] }))
const adminHolder = vi.hoisted(() => ({ esAdmin: false }))
vi.mock('../hooks/usePeritajes.js', () => ({
  usePeritajes: () => ({ data: peritajesHolder.data, isLoading: false }),
  usePeritaje: () => ({ data: null }),
  usePeritajeMutations: () => ({
    crear: { mutate: vi.fn(), isPending: false },
    actualizar: { mutate: vi.fn(), isPending: false },
    eliminar: { mutate: vi.fn(), mutateAsync: vi.fn() },
  }),
}))
vi.mock('../hooks/useGestoria.js', () => ({
  useGestoria: () => ({ data: { estado: 'sin_iniciar' }, isLoading: false }),
  useGestoriaMutations: () => ({ guardarCampos: { mutate: vi.fn() } }),
}))
vi.mock('../hooks/useGestoriaFotos.js', () => ({
  useGestoriaFotos: () => ({ data: [], isLoading: false }),
  useGestoriaFotosMutations: () => ({ agregar: { mutate: vi.fn(), isPending: false }, borrar: { mutate: vi.fn() } }),
}))
vi.mock('../hooks/useEventos.js', () => ({ useEventos: () => ({ data: [], isLoading: false }) }))
vi.mock('../hooks/useCrmPerfil.js', () => ({ useCrmPerfil: () => ({ id: 'u1', esAdmin: adminHolder.esAdmin }) }))
vi.mock('../hooks/useCrmUsuarios.js', () => ({ useCrmUsuarios: () => ({ data: [] }) }))
vi.mock('@/crm/services/fotos.service', () => ({
  listar: vi.fn().mockResolvedValue([]),
  subir: vi.fn(),
  marcarPortada: vi.fn(),
  borrar: vi.fn(),
  subirArchivoUnico: vi.fn(),
}))

const { default: VehiculoDetallePage } = await import('../pages/VehiculoDetallePage.jsx')

function renderPage() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/crm/vehiculos/v1']}>
        <Routes>
          <Route path="/crm/vehiculos/:id" element={<VehiculoDetallePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('VehiculoDetallePage', () => {
  it('muestra las 4 pestañas y el Resumen por defecto', () => {
    renderPage()
    expect(screen.getByRole('tab', { name: 'Resumen' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Peritaje' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Gestoría' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Historial' })).toBeInTheDocument()
    // el Resumen muestra la marca/modelo
    expect(screen.getAllByText(/Toyota Hilux/).length).toBeGreaterThan(0)
  })

  it('cambiar a Historial muestra el timeline vacío', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('tab', { name: 'Historial' }))
    expect(await screen.findByText(/no hay movimientos/i)).toBeInTheDocument()
  })

  it('peritaje: sin peritaje se puede crear uno nuevo', async () => {
    peritajesHolder.data = []
    renderPage()
    await userEvent.click(screen.getByRole('tab', { name: 'Peritaje' }))
    expect(await screen.findByRole('button', { name: /nuevo peritaje/i })).toBeInTheDocument()
  })

  it('peritaje: con uno existente ya no ofrece crear otro', async () => {
    peritajesHolder.data = [{ id: 'p1', fecha: '2026-01-05', items_ok: 5, items_obs: 0, items_falta: 0, peritado_por_nombre: 'Juan' }]
    renderPage()
    await userEvent.click(screen.getByRole('tab', { name: 'Peritaje' }))
    expect(await screen.findByText(/un peritaje por vehículo/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /nuevo peritaje/i })).not.toBeInTheDocument()
    peritajesHolder.data = []
  })

  it('peritaje: con duplicados el admin ve opciones para conservar o eliminar', async () => {
    adminHolder.esAdmin = true
    peritajesHolder.data = [
      { id: 'p1', fecha: '2026-01-05', items_ok: 5, items_obs: 0, items_falta: 0 },
      { id: 'p2', fecha: '2026-02-10', items_ok: 3, items_obs: 2, items_falta: 1 },
    ]
    renderPage()
    await userEvent.click(screen.getByRole('tab', { name: 'Peritaje' }))
    expect(await screen.findByText(/tiene 2 peritajes/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /conservar este/i })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /^eliminar$/i })).toHaveLength(2)
    peritajesHolder.data = []
    adminHolder.esAdmin = false
  })

  it('peritaje: con duplicados un no-admin no ve botones de borrado', async () => {
    adminHolder.esAdmin = false
    peritajesHolder.data = [
      { id: 'p1', fecha: '2026-01-05', items_ok: 5, items_obs: 0, items_falta: 0 },
      { id: 'p2', fecha: '2026-02-10', items_ok: 3, items_obs: 2, items_falta: 1 },
    ]
    renderPage()
    await userEvent.click(screen.getByRole('tab', { name: 'Peritaje' }))
    expect(await screen.findByText(/tiene 2 peritajes/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /conservar este/i })).not.toBeInTheDocument()
    peritajesHolder.data = []
  })

  it('marca la pestaña activa (aria-selected + data-active) para poder resaltarla', async () => {
    renderPage()
    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('tab', { name: 'Peritaje' }))
    const peritaje = screen.getByRole('tab', { name: 'Peritaje' })
    expect(peritaje).toHaveAttribute('aria-selected', 'true')
    expect(peritaje).toHaveAttribute('data-active')
    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'false')
  })
})
