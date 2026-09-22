// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AlertaRow from '../components/AlertaRow'

const alerta = {
  id: 1, titulo: 'ITV Cronos', fecha: '2026-10-01', hora: '10:00', hecha: false,
  asignado: { nombre: 'Bruno' }, cliente: null, vehiculo: { marca: 'Fiat', modelo: 'Cronos' },
}

function renderRow(props = {}) {
  return render(
    <MemoryRouter>
      <AlertaRow alerta={alerta} onToggle={vi.fn()} onEditar={vi.fn()} onEliminar={vi.fn()} puedeEliminar {...props} />
    </MemoryRouter>,
  )
}

describe('AlertaRow', () => {
  it('muestra título, fecha/hora y a quién está asignada', () => {
    renderRow()
    expect(screen.getByText('ITV Cronos')).toBeInTheDocument()
    expect(screen.getByText(/2026-10-01/)).toBeInTheDocument()
    expect(screen.getByTitle('Bruno')).toBeInTheDocument()
  })

  it('click en el check llama onToggle con hecha=true', () => {
    const onToggle = vi.fn()
    renderRow({ onToggle })
    fireEvent.click(screen.getByRole('button', { name: /marcar hecha/i }))
    expect(onToggle).toHaveBeenCalledWith(alerta, true)
  })

  it('el vehículo referenciado se muestra como chip', () => {
    renderRow()
    expect(screen.getByText('Fiat Cronos')).toBeInTheDocument()
  })
})
