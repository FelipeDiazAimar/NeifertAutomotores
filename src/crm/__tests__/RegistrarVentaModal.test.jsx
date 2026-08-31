// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const registrarVenta = { mutate: vi.fn(), isPending: false }
vi.mock('../hooks/useClientes.js', () => ({ useClienteMutations: () => ({ registrarVenta }) }))
vi.mock('../hooks/useVehiculos.js', () => ({
  useVehiculos: () => ({
    data: { filas: [{ id: 'v1', marca: 'Ford', modelo: 'KA', estado: 'disponible', moneda: 'ARS', precio_contado: 100 }] },
    isLoading: false,
  }),
}))

const { default: RegistrarVentaModal } = await import('../components/RegistrarVentaModal.jsx')

describe('RegistrarVentaModal', () => {
  it('elegir un vehículo y confirmar llama registrarVenta', async () => {
    registrarVenta.mutate.mockReset()
    render(<RegistrarVentaModal clienteId="c1" open onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Ford KA/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirmar venta/i }))
    expect(registrarVenta.mutate).toHaveBeenCalledWith(
      { vehiculoId: 'v1', estadoVehiculo: 'disponible' },
      expect.any(Object),
    )
  })
})
