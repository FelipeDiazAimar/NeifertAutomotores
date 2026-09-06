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
const g2 = {
  id: 'g2', estado: 'completo',
  form08_hecho: true, verif_policial_hecho: true, multas_nac_hecho: true,
  dominio_hist_hecho: true, libre_deudas_hecho: true, titulo_hecho: true,
  cedulas_hecho: true, identificacion_hecho: true,
  vehiculo: { id: 'v2', marca: 'Ford', modelo: 'Ka', patente: 'BB2' },
}

describe('GestoriaListPage', () => {
  it('lista con el conteo de trámites hechos X/8', () => {
    useGestoriasTodas.mockReturnValue({ data: [g1, g2], isLoading: false })
    render(<MemoryRouter><GestoriaListPage /></MemoryRouter>)
    expect(screen.getByText('VW Amarok')).toBeInTheDocument()
    expect(screen.getByText('2/8')).toBeInTheDocument()
    expect(screen.getByText('8/8')).toBeInTheDocument()
  })

  it('los botones de filtro muestran el recuento por estado', () => {
    useGestoriasTodas.mockReturnValue({ data: [g1, g2], isLoading: false })
    render(<MemoryRouter><GestoriaListPage /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /todas/i })).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: /en proceso/i })).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /completas/i })).toHaveTextContent('1')
  })

  it('filtrar por "Completas" deja solo esa fila', async () => {
    useGestoriasTodas.mockReturnValue({ data: [g1, g2], isLoading: false })
    render(<MemoryRouter><GestoriaListPage /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: /completas/i }))
    expect(screen.getByText('Ford Ka')).toBeInTheDocument()
    expect(screen.queryByText('VW Amarok')).not.toBeInTheDocument()
  })
})
