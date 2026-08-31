// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ClienteForm from '../components/ClienteForm.jsx'

describe('ClienteForm', () => {
  it('envía los valores editados', async () => {
    const onGuardar = vi.fn()
    render(<ClienteForm inicial={{ nombre: 'Ana' }} onGuardar={onGuardar} />)
    const nombre = screen.getByLabelText('Nombre')
    await userEvent.clear(nombre)
    await userEvent.type(nombre, 'Ana López')
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(onGuardar).toHaveBeenCalledTimes(1)
    expect(onGuardar.mock.calls[0][0]).toMatchObject({ nombre: 'Ana López' })
  })

  it('nombre vacío → error y no envía', async () => {
    const onGuardar = vi.fn()
    render(<ClienteForm inicial={{ nombre: 'Ana' }} onGuardar={onGuardar} />)
    await userEvent.clear(screen.getByLabelText('Nombre'))
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(await screen.findByText(/nombre es obligatorio/i)).toBeInTheDocument()
    expect(onGuardar).not.toHaveBeenCalled()
  })
})
