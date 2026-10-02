// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const cropImage = vi.fn()
vi.mock('@/lib/mediaFormats', () => ({
  cropImage: (...args) => cropImage(...args),
  rotateImageClockwise: vi.fn(),
}))

import ImageCropper from '../ImageCropper'

beforeEach(() => {
  global.URL.createObjectURL = vi.fn().mockReturnValue('blob:x')
  global.URL.revokeObjectURL = vi.fn()
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
  }))
  cropImage.mockReset()
})

describe('ImageCropper', () => {
  it('tras confirmar un recorte con éxito, el botón vuelve a "Usar recorte" (no queda pegado en "Procesando…")', async () => {
    const fileA = new File(['a'], 'a.jpg', { type: 'image/jpeg' })
    const croppedA = new File(['a-cropped'], 'a-cropped.jpg', { type: 'image/jpeg' })
    cropImage.mockResolvedValue(croppedA)
    const onConfirm = vi.fn()

    render(<ImageCropper file={fileA} onConfirm={onConfirm} onCancel={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: /usar recorte/i }))

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(croppedA))
    expect(screen.getByRole('button', { name: /usar recorte/i })).toBeInTheDocument()
    expect(screen.queryByText(/procesando/i)).not.toBeInTheDocument()
  })

  it('al pasar a la siguiente foto de la cola (cambia `file`), el botón está disponible, no pegado en "Procesando…"', async () => {
    const fileA = new File(['a'], 'a.jpg', { type: 'image/jpeg' })
    const fileB = new File(['b'], 'b.jpg', { type: 'image/jpeg' })
    cropImage.mockResolvedValue(new File(['a-cropped'], 'a-cropped.jpg', { type: 'image/jpeg' }))
    const onConfirm = vi.fn()

    const { rerender } = render(<ImageCropper file={fileA} onConfirm={onConfirm} onCancel={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /usar recorte/i }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))

    // El padre saca fileA de la cola y pasa fileB, pero mantiene montado el
    // mismo ImageCropper (así se reproducía el bug: quedaba en "Procesando…").
    rerender(<ImageCropper file={fileB} onConfirm={onConfirm} onCancel={vi.fn()} />)

    expect(screen.getByRole('button', { name: /usar recorte/i })).not.toBeDisabled()
    expect(screen.queryByText(/procesando/i)).not.toBeInTheDocument()
  })
})
