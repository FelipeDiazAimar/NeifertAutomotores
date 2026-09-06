// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import FichaCliente from '../components/FichaCliente.jsx'

const c = { id: 'c1', nombre: 'Ana López', telefono: '3564', status: 'activo', canal: 'salon', fotos: [] }
const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)
const props = { onCambiarStatus: vi.fn(), onArchivar: vi.fn(), onEliminar: vi.fn(), onRegistrarVenta: vi.fn() }

describe('FichaCliente', () => {
  it('sin permiso no muestra Eliminar', () => {
    wrap(<FichaCliente cliente={c} puedeEliminar={false} {...props} />)
    expect(screen.queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument()
  })

  it('cliente vendido no muestra Registrar venta', () => {
    wrap(<FichaCliente cliente={{ ...c, status: 'vendido' }} puedeEliminar {...props} />)
    expect(screen.queryByRole('button', { name: /registrar venta/i })).not.toBeInTheDocument()
  })

  it('cambiar status dispara el callback', async () => {
    const onCambiarStatus = vi.fn()
    wrap(<FichaCliente cliente={c} puedeEliminar {...props} onCambiarStatus={onCambiarStatus} />)
    await userEvent.click(screen.getByRole('button', { name: /cambiar status/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /perdido/i }))
    expect(onCambiarStatus).toHaveBeenCalledWith('perdido')
  })
})
