// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const usePeritajesVehiculos = vi.fn()
vi.mock('../hooks/usePeritajes.js', () => ({ usePeritajesVehiculos: (o) => usePeritajesVehiculos(o) }))

const { default: PeritajesListPage } = await import('../pages/PeritajesListPage.jsx')

const filas = [
  {
    vehiculo: { id: 'v1', marca: 'Toyota', modelo: 'Hilux', patente: 'AA123BB' },
    peritaje: {
      id: 'p1', fecha: '2026-06-04', costo_total: null,
      items_ok: 31, items_obs: 0, items_falta: 1,
      peritado_por_nombre: 'Cristian', peritador: null,
    },
    cantidad: 1,
    estadoPeritaje: 'en_proceso',
  },
  {
    vehiculo: { id: 'v2', marca: 'Ford', modelo: 'Ka', patente: 'CC456DD' },
    peritaje: null, cantidad: 0, estadoPeritaje: 'sin_iniciar',
  },
]

describe('PeritajesListPage', () => {
  it('lista vehículos con su estado y el resultado del peritaje', () => {
    usePeritajesVehiculos.mockReturnValue({ data: filas, isLoading: false })
    render(<MemoryRouter><PeritajesListPage /></MemoryRouter>)
    expect(screen.getByText('Toyota Hilux')).toBeInTheDocument()
    expect(screen.getByText('Ford Ka')).toBeInTheDocument()
    // "En proceso" / "Sin peritar" salen también como botón de filtro
    expect(screen.getAllByText('En proceso').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Sin peritar').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/31 ok · 0 obs · 1 falta/)).toBeInTheDocument()
    expect(screen.getByText('Cristian')).toBeInTheDocument()
  })

  it('los botones de filtro muestran el recuento por estado', () => {
    usePeritajesVehiculos.mockReturnValue({ data: filas, isLoading: false })
    render(<MemoryRouter><PeritajesListPage /></MemoryRouter>)
    const todos = screen.getByRole('button', { name: /todos/i })
    expect(todos).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: /en proceso/i })).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /sin peritar/i })).toHaveTextContent('1')
  })

  it('filtrar por "Completo" (sin resultados) muestra el vacío', async () => {
    usePeritajesVehiculos.mockReturnValue({ data: filas, isLoading: false })
    render(<MemoryRouter><PeritajesListPage /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: /^completo/i }))
    expect(screen.getByText('Sin resultados')).toBeInTheDocument()
    expect(screen.queryByText('Toyota Hilux')).not.toBeInTheDocument()
  })

  it('filtrar por "En proceso" deja solo esa fila', async () => {
    usePeritajesVehiculos.mockReturnValue({ data: filas, isLoading: false })
    render(<MemoryRouter><PeritajesListPage /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: /en proceso/i }))
    expect(screen.getByText('Toyota Hilux')).toBeInTheDocument()
    expect(screen.queryByText('Ford Ka')).not.toBeInTheDocument()
  })
})
