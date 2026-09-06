// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import FichaVehiculo from '../components/FichaVehiculo.jsx'

const v = {
  id: 'v1', marca: 'Toyota', modelo: 'Hilux', version: 'SRX', patente: 'AB123CD',
  anio: 2020, km: 45000, transmision: 'automático', moneda: 'USD', precio_contado: 32000,
  estado: 'disponible', itv: 'si', consignacion: false, tiene_iva: false,
  duenio_nombre: 'Juan', duenio_apellido: 'Pérez', nota: null, fotos: [],
}

const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('FichaVehiculo', () => {
  it('sin fotos muestra la patente como placeholder', () => {
    wrap(<FichaVehiculo vehiculo={v} onCambiarEstado={vi.fn()} onArchivar={vi.fn()} onEliminar={vi.fn()} puedeEliminar={false} />)
    expect(screen.getAllByText('AB123CD').length).toBeGreaterThan(0)
    expect(screen.getByText(/32\.000/)).toBeInTheDocument()
  })

  it('sin permiso no muestra Eliminar', () => {
    wrap(<FichaVehiculo vehiculo={v} onCambiarEstado={vi.fn()} onArchivar={vi.fn()} onEliminar={vi.fn()} puedeEliminar={false} />)
    expect(screen.queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument()
  })

  it('cambiar estado dispara el callback', async () => {
    const onCambiarEstado = vi.fn()
    wrap(<FichaVehiculo vehiculo={v} onCambiarEstado={onCambiarEstado} onArchivar={vi.fn()} onEliminar={vi.fn()} puedeEliminar />)
    await userEvent.click(screen.getByRole('button', { name: /cambiar estado/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /vendido/i }))
    expect(onCambiarEstado).toHaveBeenCalledWith('vendido')
  })
})
