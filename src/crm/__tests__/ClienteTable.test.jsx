// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ClienteTable from '../components/ClienteTable.jsx'

const filas = [
  {
    id: 'c1', nombre: 'Ana López', telefono: '3564 11-2233', localidad: 'San Francisco',
    marca_interes: 'Nissan', modelo_interes: 'Kicks', presupuesto: 30000000,
    canal: 'salon', status: 'activo',
  },
]

function renderTable(props = {}) {
  return render(
    <MemoryRouter>
      <ClienteTable filas={filas} onCambiarStatus={vi.fn()} {...props} />
    </MemoryRouter>,
  )
}

describe('ClienteTable', () => {
  it('muestra los datos de la fila', () => {
    renderTable()
    expect(screen.getByText('Ana López')).toBeInTheDocument()
    expect(screen.getByText('3564 11-2233')).toBeInTheDocument()
    expect(screen.getByText(/Nissan Kicks/)).toBeInTheDocument()
  })

  it('el menú de status ofrece 4 opciones y dispara onCambiarStatus', async () => {
    const onCambiarStatus = vi.fn()
    renderTable({ onCambiarStatus })
    await userEvent.click(screen.getByRole('button', { name: /status de ana lópez/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /perdido/i }))
    expect(onCambiarStatus).toHaveBeenCalledWith(filas[0], 'perdido')
  })
})
