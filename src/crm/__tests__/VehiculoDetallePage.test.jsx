// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const vehiculo = { id: 'v1', marca: 'Toyota', modelo: 'Hilux', estado: 'disponible', fotos: [] }

vi.mock('../hooks/useVehiculos.js', () => ({
  useVehiculo: () => ({ data: vehiculo, isLoading: false }),
  useVehiculoMutations: () => ({
    cambiarEstado: { mutate: vi.fn() }, archivar: { mutate: vi.fn() }, eliminar: { mutate: vi.fn() },
  }),
}))
vi.mock('../hooks/usePeritajes.js', () => ({
  usePeritajes: () => ({ data: [], isLoading: false }),
  usePeritaje: () => ({ data: null }),
  usePeritajeMutations: () => ({ crear: { mutate: vi.fn(), isPending: false } }),
}))
vi.mock('../hooks/useGestoria.js', () => ({
  useGestoria: () => ({ data: { estado: 'sin_iniciar' }, isLoading: false }),
  useGestoriaMutations: () => ({ guardarCampos: { mutate: vi.fn() } }),
}))
vi.mock('../hooks/useEventos.js', () => ({ useEventos: () => ({ data: [], isLoading: false }) }))
vi.mock('../hooks/useCrmPerfil.js', () => ({ useCrmPerfil: () => ({ id: 'u1', esAdmin: false }) }))
vi.mock('../hooks/useCrmUsuarios.js', () => ({ useCrmUsuarios: () => ({ data: [] }) }))
vi.mock('../components/FotosUploader.jsx', () => ({ default: () => <div>fotos</div> }))

const { default: VehiculoDetallePage } = await import('../pages/VehiculoDetallePage.jsx')

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/crm/vehiculos/v1']}>
      <Routes>
        <Route path="/crm/vehiculos/:id" element={<VehiculoDetallePage />} />
      </Routes>
    </MemoryRouter>,
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
})
