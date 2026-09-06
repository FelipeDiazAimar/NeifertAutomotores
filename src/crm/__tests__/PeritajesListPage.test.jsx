// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const usePeritajesTodos = vi.fn()
vi.mock('../hooks/usePeritajes.js', () => ({ usePeritajesTodos: (o) => usePeritajesTodos(o) }))

const { default: PeritajesListPage } = await import('../pages/PeritajesListPage.jsx')

const filas = [
  {
    id: 'p1', fecha: '2026-06-04', costo_total: 150000,
    items_ok: 30, items_obs: 1, items_falta: 2,
    vehiculo: { id: 'v1', marca: 'Toyota', modelo: 'Hilux', patente: 'AA123BB' },
    peritador: { nombre: 'Nico' },
  },
]

describe('PeritajesListPage', () => {
  it('lista los peritajes con su vehículo y quien peritó', () => {
    usePeritajesTodos.mockReturnValue({ data: filas, isLoading: false })
    render(<MemoryRouter><PeritajesListPage /></MemoryRouter>)
    expect(screen.getByText('Toyota Hilux')).toBeInTheDocument()
    expect(screen.getByText('Nico')).toBeInTheDocument()
    expect(screen.getByText('$ 150.000')).toBeInTheDocument()
  })

  it('el toggle "Con faltas" cambia el parámetro del hook', async () => {
    usePeritajesTodos.mockReturnValue({ data: filas, isLoading: false })
    render(<MemoryRouter><PeritajesListPage /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: /con faltas/i }))
    expect(usePeritajesTodos).toHaveBeenLastCalledWith(expect.objectContaining({ soloConFaltas: true }))
  })

  it('estado vacío', () => {
    usePeritajesTodos.mockReturnValue({ data: [], isLoading: false })
    render(<MemoryRouter><PeritajesListPage /></MemoryRouter>)
    expect(screen.getByText('No hay peritajes')).toBeInTheDocument()
  })
})
