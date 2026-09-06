// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// recharts no renderiza en jsdom sin tamaño; stub de los sub-componentes.
vi.mock('recharts', () => {
  const D = ({ children }) => <div>{children}</div>
  return {
    ResponsiveContainer: D, BarChart: D, Bar: D, XAxis: D, YAxis: D, Tooltip: D,
    PieChart: D, Pie: D, Cell: D, Legend: D,
  }
})

const { default: GraficoMarcas } = await import('../components/GraficoMarcas.jsx')
const { default: GraficoTipos } = await import('../components/GraficoTipos.jsx')

describe('gráficos', () => {
  it('GraficoMarcas con datos muestra el título', () => {
    render(<GraficoMarcas datos={[{ nombre: 'Ford', n: 5 }]} />)
    expect(screen.getByText('Marcas más pedidas')).toBeInTheDocument()
  })
  it('GraficoMarcas sin datos → empty state', () => {
    render(<GraficoMarcas datos={[]} />)
    expect(screen.getByText(/sin datos de interés/i)).toBeInTheDocument()
  })
  it('GraficoTipos con datos muestra el título', () => {
    render(<GraficoTipos datos={[{ nombre: 'SUV', n: 3 }]} />)
    expect(screen.getByText('Tipos más pedidos')).toBeInTheDocument()
  })
})
