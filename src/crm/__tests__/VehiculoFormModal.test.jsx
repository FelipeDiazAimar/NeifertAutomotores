// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../hooks/useVehiculos.js', () => ({
  useVehiculoMutations: () => ({ crear: { mutate: vi.fn(), isPending: false } }),
}))
vi.mock('../components/VehiculoForm.jsx', () => ({
  default: () => <div data-testid="form">formulario</div>,
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
})
