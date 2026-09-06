// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const crear = { mutate: vi.fn(), isPending: false }
const actualizar = { mutate: vi.fn(), isPending: false }
vi.mock('../hooks/useVehiculos.js', () => ({
  useVehiculoMutations: () => ({ crear, actualizar }),
}))
vi.mock('../components/VehiculoForm.jsx', () => ({
  default: ({ onGuardar, inicial }) => (
    <div data-testid="form">
      <span data-testid="inicial">{JSON.stringify(inicial ?? null)}</span>
      <button onClick={() => onGuardar({ marca: 'Ford', modelo: 'Ka' })}>guardar</button>
    </div>
  ),
}))

const { default: VehiculoFormModal } = await import('../components/VehiculoFormModal.jsx')

beforeEach(() => {
  document.body.style.overflow = ''
  document.body.style.paddingRight = ''
  document.documentElement.style.overflow = ''
})

describe('VehiculoFormModal', () => {
  it('no renderiza nada mientras está cerrado y no toca el scroll', () => {
    render(<VehiculoFormModal open={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('al abrir bloquea el scroll de <html> y <body> y lo restaura al cerrar', () => {
    const { rerender } = render(<VehiculoFormModal open onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.body.style.overflow).toBe('hidden')

    rerender(<VehiculoFormModal open={false} onClose={vi.fn()} />)
    expect(document.documentElement.style.overflow).toBe('')
    expect(document.body.style.overflow).toBe('')
    expect(document.body.style.paddingRight).toBe('')
  })

  it('cierra con la tecla Escape', async () => {
    const onClose = vi.fn()
    render(<VehiculoFormModal open onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('cierra al hacer click en el botón de cerrar', async () => {
    const onClose = vi.fn()
    render(<VehiculoFormModal open onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('alta: título "Cargar vehículo" y usa crear', async () => {
    crear.mutate.mockReset()
    render(<VehiculoFormModal open onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Cargar vehículo' })).toBeInTheDocument()
    expect(screen.getByTestId('inicial')).toHaveTextContent('null')
    await userEvent.click(screen.getByRole('button', { name: 'guardar' }))
    expect(crear.mutate).toHaveBeenCalledWith({ marca: 'Ford', modelo: 'Ka' }, expect.anything())
  })

  it('edición: título "Editar …", precarga campos y usa actualizar', async () => {
    actualizar.mutate.mockReset()
    const vehiculo = { id: 'v9', marca: 'Ford', modelo: 'Ka', patente: 'AA1', anio: 2019 }
    render(<VehiculoFormModal open vehiculo={vehiculo} onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Editar Ford Ka' })).toBeInTheDocument()
    expect(screen.getByTestId('inicial')).toHaveTextContent('"patente":"AA1"')
    await userEvent.click(screen.getByRole('button', { name: 'guardar' }))
    expect(actualizar.mutate).toHaveBeenCalledWith(
      { id: 'v9', data: { marca: 'Ford', modelo: 'Ka' } },
      expect.anything(),
    )
  })
})
