// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('recharts', () => {
  const D = ({ children }) => <div>{children}</div>
  return {
    ResponsiveContainer: D, BarChart: D, Bar: D, XAxis: D, YAxis: D, Tooltip: D,
    PieChart: D, Pie: D, Cell: D, Legend: D,
  }
})
vi.mock('../hooks/useDashboard.js', () => ({
  useKpis: () => ({ data: { clientesActivos: 175, vehiculosDisponibles: 58, valorStock: { ars: 812132300, usd: 0 }, alertasActivas: 0, vendidosMes: 2 }, isLoading: false }),
  useDemanda: () => ({ data: { marcas: [{ nombre: 'Ford', n: 5 }], tipos: [{ nombre: 'SUV', n: 3 }] }, isLoading: false }),
  useOportunidades: () => ({ data: [], isLoading: false }),
}))

const { default: DashboardPage } = await import('../pages/DashboardPage.jsx')

describe('DashboardPage', () => {
  it('renderiza KPIs, gráficos y la sección de oportunidades', () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    expect(screen.getByText('Clientes activos')).toBeInTheDocument()
    expect(screen.getByText('175')).toBeInTheDocument()
    expect(screen.getByText('Vehículos disponibles')).toBeInTheDocument()
    expect(screen.getByText(/812\.132\.300/)).toBeInTheDocument()
    expect(screen.getByText('2 veh. vendidos')).toBeInTheDocument()
    expect(screen.getByText('Marcas más pedidas')).toBeInTheDocument()
    expect(screen.getByText('Tipos más pedidos')).toBeInTheDocument()
    expect(screen.getByText('Oportunidades de venta')).toBeInTheDocument()
    expect(screen.getByText(/no hay oportunidades/i)).toBeInTheDocument()
  })
})
