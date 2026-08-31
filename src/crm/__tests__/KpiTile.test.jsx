// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import KpiTile from '../components/KpiTile.jsx'

describe('KpiTile', () => {
  it('renderiza label, valor y sub', () => {
    render(<KpiTile label="Clientes activos" valor="175" sub="en seguimiento" />)
    expect(screen.getByText('Clientes activos')).toBeInTheDocument()
    expect(screen.getByText('175')).toBeInTheDocument()
    expect(screen.getByText('en seguimiento')).toBeInTheDocument()
  })
})
