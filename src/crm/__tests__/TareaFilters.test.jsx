// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TareaFilters from '../components/TareaFilters.jsx'
import { useTareasFiltros } from '../store/useTareasFiltros.js'

vi.mock('../hooks/useCrmUsuarios.js', () => ({ useCrmUsuarios: () => ({ data: [] }) }))

beforeEach(() => useTareasFiltros.getState().resetFiltros())

describe('TareaFilters', () => {
  it('togglear prioridad "Alta" la agrega', async () => {
    render(<TareaFilters />)
    await userEvent.click(screen.getByRole('button', { name: /^alta$/i }))
    expect(useTareasFiltros.getState().filtros.prioridad).toContain('alta')
  })

  it('Limpiar resetea', async () => {
    useTareasFiltros.getState().setFiltro('soloConCliente', true)
    render(<TareaFilters />)
    await userEvent.click(screen.getByRole('button', { name: /limpiar/i }))
    expect(useTareasFiltros.getState().filtros.soloConCliente).toBe(false)
  })
})
