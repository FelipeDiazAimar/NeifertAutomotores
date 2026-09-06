// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import HistorialTimeline from '../components/HistorialTimeline.jsx'
import { textoEvento } from '../lib/textoEvento.js'

const mockUse = vi.fn()
vi.mock('../hooks/useEventos.js', () => ({ useEventos: () => mockUse() }))

describe('textoEvento', () => {
  it('cambio_estado incluye de y a', () => {
    const t = textoEvento({ tipo: 'cambio_estado', datos: { de: 'disponible', a: 'reservado' }, usuario: { nombre: 'Bruno' } })
    expect(t).toContain('disponible')
    expect(t).toContain('reservado')
    expect(t).toContain('Bruno')
  })
})

describe('HistorialTimeline', () => {
  it('vacío → mensaje de sin movimientos', () => {
    mockUse.mockReturnValue({ data: [], isLoading: false })
    render(<HistorialTimeline vehiculoId="v1" />)
    expect(screen.getByText(/no hay movimientos/i)).toBeInTheDocument()
  })

  it('renderiza un evento', () => {
    mockUse.mockReturnValue({
      data: [{ id: 1, tipo: 'alta', datos: {}, usuario: { nombre: 'Bruno' }, creado_en: new Date().toISOString() }],
      isLoading: false,
    })
    render(<HistorialTimeline vehiculoId="v1" />)
    expect(screen.getByText(/Bruno cargó el vehículo/)).toBeInTheDocument()
  })
})
