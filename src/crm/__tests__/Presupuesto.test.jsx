// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/crm/services/fotos.service', () => ({
  listar: vi.fn().mockResolvedValue([]),
  subir: vi.fn(),
  marcarPortada: vi.fn(),
  borrar: vi.fn(),
  subirArchivoUnico: vi.fn(),
}))

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

const { default: FichaVehiculo } = await import('../components/FichaVehiculo.jsx')
const { construirDatosPresupuesto, formatearPrecio, tituloVehiculo } = await import('../lib/presupuestoTemplate.js')

const v = {
  id: 'v1',
  marca: 'Chevrolet',
  modelo: 'S-10',
  version: 'WT C/D 4X2',
  patente: 'AB123CD',
  anio: 2026,
  km: 0,
  es_0km: true,
  color: 'A definir',
  moneda: 'ARS',
  precio_contado: 45500000,
  estado: 'disponible',
  fotos: [],
}

function wrap(ui) {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Presupuesto vehículo', () => {
  beforeEach(() => {
    localStorage.clear()
    plantillaHolder.guardar.mutate.mockClear()
    plantillaHolder.puedeEditar = true
  })

  it('construye título y precio desde el vehículo', () => {
    const d = construirDatosPresupuesto(v)
    expect(tituloVehiculo(v)).toBe('CHEVROLET S-10 WT C/D 4X2')
    expect(d.precioEntrega).toMatch(/45\.500\.000/)
    expect(d.financiacion).toHaveLength(6)
  })

  it('formatea USD con prefijo y respeta la moneda del vehículo', () => {
    expect(formatearPrecio(14100, 'USD')).toBe('USD 14.100')
    expect(formatearPrecio(45500000, 'ARS')).toBe('$45.500.000')
    const d = construirDatosPresupuesto({ ...v, moneda: 'USD', precio_contado: 14100 }, {}, null)
    expect(d.precioEntrega).toBe('USD 14.100')
  })

  it('el botón Presupuesto está a la izquierda de Editar y abre el modal con preview', async () => {
    const user = userEvent.setup()
    wrap(<FichaVehiculo vehiculo={v} onCambiarEstado={vi.fn()} onEliminar={vi.fn()} puedeEliminar={false} />)
    const botones = screen.getAllByRole('button')
    const idxPres = botones.findIndex((b) => /presupuesto/i.test(b.textContent))
    const idxEdit = botones.findIndex((b) => /^editar$/i.test(b.textContent.trim()) || /cerrar edición/i.test(b.textContent))
    expect(idxPres).toBeGreaterThanOrEqual(0)
    expect(idxEdit).toBeGreaterThanOrEqual(0)
    expect(idxPres).toBeLessThan(idxEdit)

    await user.click(screen.getByRole('button', { name: /presupuesto/i }))
    expect(await screen.findByTestId('presupuesto-modal')).toBeInTheDocument()
    expect(screen.getByTestId('presupuesto-plantilla')).toBeInTheDocument()
    // exportar a la derecha de editar + menú desplegable con las 3 opciones
    const botonesModal = screen.getAllByRole('button', { name: /editar plantilla|exportar/i })
    const idxEditar = botonesModal.findIndex((b) => /editar plantilla/i.test(b.textContent))
    const idxExportar = botonesModal.findIndex((b) => /exportar/i.test(b.textContent))
    expect(idxEditar).toBeGreaterThanOrEqual(0)
    expect(idxExportar).toBeGreaterThanOrEqual(0)
    expect(idxExportar).toBeGreaterThan(idxEditar)
    expect(screen.queryByTestId('presupuesto-menu')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('presupuesto-exportar'))
    expect(screen.getByTestId('presupuesto-menu')).toBeInTheDocument()
    expect(screen.getByTestId('presupuesto-opcion-imagen')).toBeInTheDocument()
    expect(screen.getByTestId('presupuesto-opcion-pdf')).toBeInTheDocument()
    expect(screen.getByTestId('presupuesto-opcion-copiar')).toBeInTheDocument()
    expect(screen.getByTestId('presupuesto-editar')).toBeInTheDocument()
  })

  it('el precio se ajusta al campo y va inclinado', async () => {
    const user = userEvent.setup()
    wrap(<FichaVehiculo vehiculo={v} onCambiarEstado={vi.fn()} onEliminar={vi.fn()} puedeEliminar={false} />)
    await user.click(screen.getByRole('button', { name: /presupuesto/i }))
    const plantilla = await screen.findByTestId('presupuesto-plantilla')
    const precio = plantilla.querySelector('span:last-child')
    expect(plantilla.textContent).toMatch(/45\.500\.000/)
    // algún nodo inclinado (skew) dentro de la plantilla
    const inclinado = Array.from(plantilla.querySelectorAll('span')).some((s) =>
      (s.getAttribute('style') ?? '').includes('skew'),
    )
    expect(inclinado).toBe(true)
    expect(precio).toBeInTheDocument()
  })

  it('Editar plantilla muestra el formulario y guarda en la plantilla compartida', async () => {
    const user = userEvent.setup()
    wrap(<FichaVehiculo vehiculo={v} onCambiarEstado={vi.fn()} onEliminar={vi.fn()} puedeEliminar={false} />)
    await user.click(screen.getByRole('button', { name: /presupuesto/i }))
    await user.click(await screen.findByTestId('presupuesto-editar'))
    expect(screen.getByLabelText(/título \(vehículo\)/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /guardar plantilla/i }))
    expect(plantillaHolder.guardar.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ incluye: expect.any(String), financiacion: expect.any(Array) }),
      expect.anything(),
    )
  })

  it('sin permiso de edición no muestra Editar plantilla', async () => {
    plantillaHolder.puedeEditar = false
    const user = userEvent.setup()
    wrap(<FichaVehiculo vehiculo={v} onCambiarEstado={vi.fn()} onEliminar={vi.fn()} puedeEliminar={false} />)
    await user.click(screen.getByRole('button', { name: /presupuesto/i }))
    await screen.findByTestId('presupuesto-plantilla')
    expect(screen.queryByTestId('presupuesto-editar')).not.toBeInTheDocument()
  })
})
