// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= RO

const plantillaHolder = vi.hoisted(() => ({
  guardar: { mutate: vi.fn(), isPending: false },
  puedeEditar: true,
}))
vi.mock('../hooks/usePlantillaPresupuesto.js', () => ({
  usePlantillaPresupuesto: () => ({
    plantilla: null,
    cargando: false,
    error: null,
    guardar: plantillaHolder.guardar,
    puedeEditar: plantillaHolder.puedeEditar,
  }),
}))
vi.mock('../hooks/useCrmPerfil.js', () => ({
  useCrmPerfil: () => ({ id: 'u1', rol: 'admin', esAdmin: true }),
}))
vi.mock('../hooks/useVehiculos.js', () => ({
  useVehiculos: () => ({
    data: {
      filas: [
        {
          id: 'v1', marca: 'Toyota', modelo: 'Hilux', version: 'SRX', patente: 'AB123CD',
          anio: 2020, km: 45000, moneda: 'USD', precio_contado: 32000, estado: 'disponible',
          publicado: true,
        },
      ],
      total: 1,
    },
    isLoading: false,
  }),
  useVehiculoMutations: () => ({
    crear: { mutate: vi.fn(), isPending: false },
    actualizar: { mutate: vi.fn(), isPending: false },
    cambiarEstado: { mutate: vi.fn(), isPending: false },
    eliminar: { mutate: vi.fn(), isPending: false },
  }),
}))
vi.mock('../hooks/useCrmRealtime.js', () => ({ useCrmRealtime: () => {} }))

const { default: PresupuestosPage } = await import('../pages/PresupuestosPage.jsx')

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PresupuestosPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PresupuestosPage', () => {
  beforeEach(() => {
    plantillaHolder.guardar.mutate.mockClear()
    plantillaHolder.puedeEditar = true
  })

  it('muestra modos CRM y texto libre con buscador', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Presupuestos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /vehículo del crm/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /texto libre/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/buscar vehículo/i)).toBeInTheDocument()
    expect(screen.getByText('Elegí un vehículo de la lista para ver la vista previa.')).toBeInTheDocument()
  })

  it('elegir un vehículo muestra la vista previa con sus datos', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /toyota hilux/i }))
    const preview = await screen.findByTestId('presupuesto-plantilla')
    expect(preview.textContent).toMatch(/TOYOTA HILUX/)
    expect(screen.getByTestId('presupuesto-exportar')).not.toBeDisabled()
  })

  it('en texto libre pide título: sin título no hay preview ni export', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /texto libre/i }))
    expect(screen.queryByTestId('presupuesto-plantilla')).not.toBeInTheDocument()
    expect(screen.getByTestId('presupuesto-exportar')).toBeDisabled()
    await user.type(screen.getByLabelText(/título \(vehículo\)/i), 'FORD RANGER XLS')
    expect(await screen.findByTestId('presupuesto-plantilla')).toBeInTheDocument()
    expect(screen.getByTestId('presupuesto-exportar')).not.toBeDisabled()
  })

  it('editar plantilla guarda en la plantilla compartida', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /toyota hilux/i }))
    await screen.findByTestId('presupuesto-plantilla')
    await user.click(screen.getByRole('button', { name: /editar plantilla/i }))
    expect(screen.getByLabelText(/incluye/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /guardar plantilla/i }))
    expect(plantillaHolder.guardar.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ financiacion: expect.any(Array) }),
      expect.anything(),
    )
  })

  it('sin permiso de edición no muestra Editar plantilla', async () => {
    plantillaHolder.puedeEditar = false
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /toyota hilux/i }))
    await screen.findByTestId('presupuesto-plantilla')
    expect(screen.queryByRole('button', { name: /editar plantilla/i })).not.toBeInTheDocument()
  })

  it('exportar abre el menú con las 3 opciones', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /toyota hilux/i }))
    await user.click(await screen.findByTestId('presupuesto-exportar'))
    expect(screen.getByTestId('presupuesto-menu')).toBeInTheDocument()
    expect(screen.getByTestId('presupuesto-opcion-imagen')).toBeInTheDocument()
    expect(screen.getByTestId('presupuesto-opcion-pdf')).toBeInTheDocument()
    expect(screen.getByTestId('presupuesto-opcion-copiar')).toBeInTheDocument()
    await waitFor(() => {})
  })

  it('muestra Imprimir deshabilitado sin vehículo', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Descargar' })).not.toBeInTheDocument()
  })

  it('con vehículo, Imprimir se habilita', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /toyota hilux/i }))
    await screen.findByTestId('presupuesto-plantilla')
    expect(screen.getByRole('button', { name: 'Imprimir' })).not.toBeDisabled()
  })

  it('el zoom muestra el porcentaje y amplía al pedirlo', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /toyota hilux/i }))
    await screen.findByTestId('presupuesto-plantilla')
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reducir zoom' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ampliar zoom' }))
    expect(screen.getByText('125%')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ajustar a pantalla' }))
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pantalla completa' })).toBeInTheDocument()
  })
})
