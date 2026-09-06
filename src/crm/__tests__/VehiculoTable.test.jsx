// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import VehiculoTable from '../components/VehiculoTable.jsx'

const filas = [
  {
    id: 'v1', marca: 'Toyota', modelo: 'Hilux', version: 'SRX', patente: 'AB123CD',
    anio: 2020, km: 45000, moneda: 'USD', precio_contado: 32000, estado: 'disponible',
    fotos: [], peritajes: [], gestoria: null,
  },
]

function renderTable(props = {}) {
  return render(
    <MemoryRouter>
      <VehiculoTable filas={filas} onCambiarEstado={vi.fn()} {...props} />
    </MemoryRouter>,
  )
}

describe('VehiculoTable', () => {
  it('muestra los datos de la fila', () => {
    renderTable()
    expect(screen.getByText(/Toyota Hilux/)).toBeInTheDocument()
    expect(screen.getByText('AB123CD')).toBeInTheDocument()
    expect(screen.getByText(/32\.000/)).toBeInTheDocument()
  })

  it('el menú de estado ofrece las 4 opciones y dispara onCambiarEstado', async () => {
    const onCambiarEstado = vi.fn()
    renderTable({ onCambiarEstado })
    await userEvent.click(screen.getByRole('button', { name: /estado de hilux/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /reservado/i }))
    expect(onCambiarEstado).toHaveBeenCalledWith(filas[0], 'reservado')
  })

  it('sin peritaje ni gestoría muestra botones "Cargar" que llevan a su pestaña', async () => {
    renderTable()
    const cargarPeritaje = screen.getByRole('button', { name: /cargar peritaje de toyota hilux/i })
    const cargarGestoria = screen.getByRole('button', { name: /cargar gestoría de toyota hilux/i })
    expect(cargarPeritaje).toBeInTheDocument()
    expect(cargarGestoria).toBeInTheDocument()
  })

  it('con peritaje cargado no muestra el botón "Cargar peritaje"', () => {
    render(
      <MemoryRouter>
        <VehiculoTable
          filas={[{ ...filas[0], peritajes: [{ items_ok: 30, items_obs: 0, items_falta: 1 }] }]}
          onCambiarEstado={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: /cargar peritaje/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cargar gestoría/i })).toBeInTheDocument()
  })
})
