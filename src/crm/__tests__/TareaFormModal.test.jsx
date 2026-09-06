// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const crear = { mutate: vi.fn(), isPending: false }
const actualizar = { mutate: vi.fn(), isPending: false }
vi.mock('../hooks/useTareas.js', () => ({ useTareaMutations: () => ({ crear, actualizar }) }))
vi.mock('../hooks/useCrmUsuarios.js', () => ({ useCrmUsuarios: () => ({ data: [{ id: 'u1', nombre: 'Bruno' }] }) }))
vi.mock('../hooks/useCrmPerfil.js', () => ({ useCrmPerfil: () => ({ id: 'u1' }) }))
vi.mock('../hooks/useClientes.js', () => ({ useClientes: () => ({ data: { filas: [] } }) }))
vi.mock('../hooks/useVehiculos.js', () => ({ useVehiculos: () => ({ data: { filas: [] } }) }))
vi.mock('lenis/react', () => ({ useLenis: () => null }))

const { default: TareaFormModal } = await import('../components/TareaFormModal.jsx')

describe('TareaFormModal', () => {
  it('título vacío → error, no guarda', async () => {
    crear.mutate.mockReset()
    render(<TareaFormModal open onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(await screen.findByText(/título es obligatorio/i)).toBeInTheDocument()
    expect(crear.mutate).not.toHaveBeenCalled()
  })

  it('con clienteFijo el submit incluye cliente_id y no muestra el select de cliente', async () => {
    crear.mutate.mockReset()
    render(<TareaFormModal open onClose={vi.fn()} clienteFijo="c9" />)
    expect(screen.queryByLabelText('Cliente')).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Título'), 'Llamar')
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(crear.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: 'Llamar', cliente_id: 'c9' }),
      expect.any(Object),
    )
  })
})
