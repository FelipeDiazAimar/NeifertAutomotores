// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ClienteFilters from '../components/ClienteFilters.jsx'
import { useClientesFiltros } from '../store/useClientesFiltros.js'

beforeEach(() => {
  useClientesFiltros.getState().resetFiltros()
})

describe('ClienteFilters', () => {
  it('togglear un status lo agrega a filtros.status', async () => {
    render(<ClienteFilters />)
    await userEvent.click(screen.getByRole('button', { name: /^activo$/i }))
    expect(useClientesFiltros.getState().filtros.status).toContain('activo')
  })

  it('Limpiar resetea', async () => {
    useClientesFiltros.getState().setFiltro('conAutoEntrega', true)
    render(<ClienteFilters />)
    await userEvent.click(screen.getByRole('button', { name: /limpiar/i }))
    expect(useClientesFiltros.getState().filtros.conAutoEntrega).toBe(false)
  })
})
