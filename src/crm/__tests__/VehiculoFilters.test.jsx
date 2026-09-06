// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VehiculoFilters from '../components/VehiculoFilters.jsx'
import { useVehiculosFiltros } from '../store/useVehiculosFiltros.js'

beforeEach(() => {
  useVehiculosFiltros.getState().resetFiltros()
  useVehiculosFiltros.setState({ busqueda: '' })
})

describe('VehiculoFilters', () => {
  it('togglear un estado lo agrega a filtros.estado', async () => {
    render(<VehiculoFilters />)
    await userEvent.click(screen.getByRole('button', { name: /disponible/i }))
    expect(useVehiculosFiltros.getState().filtros.estado).toContain('disponible')
  })

  it('Limpiar resetea los filtros', async () => {
    useVehiculosFiltros.getState().setFiltro('moneda', 'USD')
    render(<VehiculoFilters />)
    await userEvent.click(screen.getByRole('button', { name: /limpiar/i }))
    expect(useVehiculosFiltros.getState().filtros.moneda).toBe('')
  })
})
