// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PeritajeLectura from '../components/PeritajeLectura.jsx'

const peritaje = {
  items_ok: 3,
  items_obs: 1,
  items_falta: 2,
  resena: 'Unidad sana en general.',
  datos: {
    motor: 'ok',
    frenos: 'falta',
    costoB: 150000,
    pctCapo: 20,
    obsMotor: '',
  },
}

describe('PeritajeLectura', () => {
  it('muestra la reseña y solo los ítems con valor', () => {
    render(<PeritajeLectura peritaje={peritaje} />)
    expect(screen.getByText('Unidad sana en general.')).toBeInTheDocument()
    expect(screen.getByText('Motor')).toBeInTheDocument()
    expect(screen.getByText('Frenos')).toBeInTheDocument()
    // obsMotor está vacío → no se renderiza
    expect(screen.queryByText('Observaciones')).not.toBeInTheDocument()
  })

  it('formatea moneda y porcentaje', () => {
    render(<PeritajeLectura peritaje={peritaje} />)
    expect(screen.getByText('$ 150.000')).toBeInTheDocument()
    expect(screen.getByText('20%')).toBeInTheDocument()
  })

  it('sin datos no rompe', () => {
    const { container } = render(<PeritajeLectura peritaje={{}} />)
    expect(container.firstChild).toBeInTheDocument()
    expect(screen.queryByText('Motor')).not.toBeInTheDocument()
  })
})
