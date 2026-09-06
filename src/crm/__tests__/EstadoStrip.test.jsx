// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EstadoStrip from '../components/EstadoStrip.jsx'

describe('EstadoStrip', () => {
  it('aria-label refleja los conteos', () => {
    render(<EstadoStrip ok={84} obs={6} falta={2} />)
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringMatching(/84.*6.*2/))
  })

  it('sin datos → no rompe', () => {
    render(<EstadoStrip ok={0} obs={0} falta={0} />)
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('showLegend muestra los números', () => {
    render(<EstadoStrip ok={5} obs={1} falta={0} showLegend />)
    expect(screen.getByText(/5/)).toBeInTheDocument()
  })
})
