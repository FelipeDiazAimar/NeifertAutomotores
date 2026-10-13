// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const adminHolder = vi.hoisted(() => ({ esAdmin: false }))
const dataHolder = vi.hoisted(() => ({
  filas: [
    {
      id: 'v1', marca: 'Toyota', modelo: 'Hilux', version: 'SRX', patente: 'AB123CD',
      anio: 2020, km: 45000, moneda: 'USD', precio_contado: 32000, estado: 'disponible',
      publicado: true, fotos: [], peritajes: [], gestoria: null,
    },
    {
      id: 'v2', marca: 'Ford', modelo: 'Ka', version: '', patente: 'CD456EF',
      anio: 2019, km: 60000, moneda: 'ARS', precio_contado: 9500000, estado: 'reservado',
      publicado: true, fotos: [], peritajes: [], gestoria: null,
    },
  ],
}))

vi.mock('../hooks/useVehiculos.js', () => ({
  useVehiculos: () => ({ data: { filas: dataHolder.filas, total: dataHolder.filas.length }, isLoading: false }),
  useConteoVehiculos: () => ({
    data: { disponible: 1, reservado: 1, vendido: 0, baja: 0, sinPeritar: 0, sinGestoria: 0 },
  }),
  useVehiculoMutations: () => ({
    crear: { mutate: vi.fn(), isPending: false },
    actualizar: { mutate: vi.fn(), isPending: false },
    cambiarEstado: { mutate: vi.fn(), isPending: false },
    eliminar: { mutate: vi.fn(), isPending: false },
  }),
}))
vi.mock('../hooks/useVehiculosBulk.js', () => ({
  useVehiculosBulk: () => bulkHolder,
}))
const bulkHolder = vi.hoisted(() => ({
  cambiarEstadoMasivo: { mutate: vi.fn(), isPending: false },
  actualizarMasivo: { mutate: vi.fn(), isPending: false },
  eliminarMasivo: { mutate: vi.fn(), isPending: false },
}))
vi.mock('../hooks/useCrmPerfil.js', () => ({
  useCrmPerfil: () => ({ id: 'u1', esAdmin: adminHolder.esAdmin }),
}))
vi.mock('../hooks/useCrmRealtime.js', () => ({ useCrmRealtime: () => {} }))
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsDesktop: () => false,
  useIsLarge: () => false,
  useMediaQuery: () => false,
}))
vi.mock('@/services/events.service', () => ({
  fetchVehicleStats: vi.fn().mockResolvedValue({ views: 0, conversions: 0, rate: 0 }),
}))
vi.mock('@/crm/services/fotos.service', () => ({
  listar: vi.fn().mockResolvedValue([]),
  subir: vi.fn(),
  marcarPortada: vi.fn(),
  borrar: vi.fn(),
  subirArchivoUnico: vi.fn(),
}))

const { default: VehiculosListPage } = await import('../pages/VehiculosListPage.jsx')
const { useSeleccionVehiculos } = await import('../store/useSeleccionVehiculos.js')
const { useViewModeStore } = await import('../store/useViewModeStore.js')

beforeEach(() => {
  adminHolder.esAdmin = false
  bulkHolder.cambiarEstadoMasivo.mutate.mockClear()
  bulkHolder.actualizarMasivo.mutate.mockClear()
  bulkHolder.eliminarMasivo.mutate.mockClear()
  useSeleccionVehiculos.setState({ modoSeleccion: false, ids: [] })
  useViewModeStore.setState({ viewMode: 'card' })
})

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <VehiculosListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SeleccionVehiculos en VehiculosListPage', () => {
  it('muestra el botón Seleccionar junto a Descargar stock', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Seleccionar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /descargar stock/i })).toBeInTheDocument()
  })

  it('al clicar Seleccionar las cards se vuelven seleccionables', async () => {
    renderPage()
    expect(document.querySelectorAll('div[aria-pressed]').length).toBe(0)
    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar' }))
    expect(screen.getByRole('button', { name: 'Listo' })).toBeInTheDocument()
    expect(useSeleccionVehiculos.getState().modoSeleccion).toBe(true)
    // una por card (el toggle de vista usa <button>, las cards son <div>)
    expect(document.querySelectorAll('div[aria-pressed="false"]').length).toBe(2)
  })

  it('clic en una card en modo selección la remarca y muestra la barra con N seleccionados', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar' }))
    await userEvent.click(screen.getByText('Toyota'))
    expect(document.querySelector('[data-seleccionado]')).not.toBeNull()
    expect(screen.getByTestId('check-seleccion')).toBeInTheDocument()
    expect(screen.getByText(/1 seleccionado/)).toBeInTheDocument()
    expect(screen.getByTestId('barra-masiva')).toBeInTheDocument()
  })

  it('en vista lista (móvil) la card seleccionada muestra el tilde rojo', async () => {
    useViewModeStore.setState({ viewMode: 'list' })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar' }))
    await userEvent.click(screen.getByText('Toyota Hilux'))
    expect(document.querySelector('[data-seleccionado]')).not.toBeNull()
    expect(screen.getByTestId('check-seleccion')).toBeInTheDocument()
  })

  it('la barra ofrece Estado / Es nuevo / Es 0 km / Limpiar', () => {
    useSeleccionVehiculos.setState({ modoSeleccion: true, ids: ['v1'] })
    renderPage()
    expect(screen.getByText(/1 seleccionado/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar estado en masa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Es nuevo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Es 0 km' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Limpiar' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Todos' }).length).toBeGreaterThan(0)
  })

  it('la barra muestra Eliminar si esAdmin es true', () => {
    adminHolder.esAdmin = true
    useSeleccionVehiculos.setState({ modoSeleccion: true, ids: ['v1'] })
    renderPage()
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
  })

  it('la barra no muestra Eliminar si esAdmin es false', () => {
    adminHolder.esAdmin = false
    useSeleccionVehiculos.setState({ modoSeleccion: true, ids: ['v1'] })
    renderPage()
    expect(screen.getByText(/1 seleccionado/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument()
  })

  it('Es nuevo pide confirmación y recién ahí ejecuta', async () => {
    useSeleccionVehiculos.setState({ modoSeleccion: true, ids: ['v1'] })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Es nuevo' }))
    expect(screen.getByText('Marcar como nuevos')).toBeInTheDocument()
    expect(bulkHolder.actualizarMasivo.mutate).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Marcar' }))
    expect(bulkHolder.actualizarMasivo.mutate).toHaveBeenCalledWith(
      { ids: ['v1'], data: { es_nuevo: true } },
      expect.anything(),
    )
  })

  it('Cancelar cierra el modal sin ejecutar nada', async () => {
    useSeleccionVehiculos.setState({ modoSeleccion: true, ids: ['v1', 'v2'] })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Es 0 km' }))
    expect(screen.getByText('Marcar como 0 km')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() =>
      expect(screen.queryByText('Marcar como 0 km')).not.toBeInTheDocument(),
    )
    expect(bulkHolder.actualizarMasivo.mutate).not.toHaveBeenCalled()
  })

  it('cambiar estado pide confirmación antes de ejecutar', async () => {
    useSeleccionVehiculos.setState({ modoSeleccion: true, ids: ['v1', 'v2'] })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar estado en masa' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Vendido' }))
    expect(screen.getByText(/a "Vendido"/)).toBeInTheDocument()
    expect(bulkHolder.cambiarEstadoMasivo.mutate).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar' }))
    expect(bulkHolder.cambiarEstadoMasivo.mutate).toHaveBeenCalledWith(
      {
        items: [
          { id: 'v1', de: 'disponible' },
          { id: 'v2', de: 'reservado' },
        ],
        a: 'vendido',
      },
      expect.anything(),
    )
  })
})
