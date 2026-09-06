// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const useGestoriasTodas = vi.fn()
vi.mock('../hooks/useGestoria.js', () => ({ useGestoriasTodas: (o) => useGestoriasTodas(o) }))

const { default: GestoriaListPage } = await import('../pages/GestoriaListPage.jsx')

const g1 = {
  id: 'g1', estado: 'en_proceso', fecha_inicio: '2026-06-01', fecha_cierre: null,
  form08_hecho: true, verif_policial_hecho: true, multas_nac_hecho: false,
  dominio_hist_hecho: false, libre_deudas_hecho: false, titulo_hecho: false,
  cedulas_hecho: false, identificacion_hecho: false,
  vehiculo: { id: 'v1', marca: 'VW', modelo: 'Amarok', patente: 'AA1' },
}

describe('GestoriaListPage', () => {
  it('lista con el conteo de trámites hechos X/8', () => {
    useGestoriasTodas.mockReturnValue({ data: [g1], isLoading: false })
    render(<MemoryRouter><GestoriaListPage /></MemoryRouter>)
    expect(screen.getByText('VW Amarok')).toBeInTheDocument()
    expect(screen.getByText('2/8')).toBeInTheDocument()
    // "En proceso" aparece en el filtro y en el badge de la fila
    expect(screen.getAllByText('En proceso').length).toBeGreaterThanOrEqual(1)
  })

  it('filtrar por "Completas" pasa estado al hook', async () => {
    useGestoriasTodas.mockReturnValue({ data: [g1], isLoading: false })
    render(<MemoryRouter><GestoriaListPage /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: /completas/i }))
    expect(useGestoriasTodas).toHaveBeenLastCalledWith({ estado: 'completo' })
  })
})
