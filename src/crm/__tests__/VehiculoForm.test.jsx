// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VehiculoForm from '../components/VehiculoForm.jsx'

describe('VehiculoForm', () => {
  it('envía los valores editados', async () => {
    const onGuardar = vi.fn()
    render(<VehiculoForm inicial={{ marca: 'Ford', modelo: 'KA' }} onGuardar={onGuardar} />)
    const marca = screen.getByLabelText('Marca')
    await userEvent.clear(marca)
    await userEvent.type(marca, 'Renault')
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(onGuardar).toHaveBeenCalledTimes(1)
    expect(onGuardar.mock.calls[0][0]).toMatchObject({ marca: 'Renault', modelo: 'KA' })
  })

  it('marca vacía → error y no envía', async () => {
    const onGuardar = vi.fn()
    render(<VehiculoForm inicial={{ marca: 'Ford', modelo: 'KA' }} onGuardar={onGuardar} />)
    await userEvent.clear(screen.getByLabelText('Marca'))
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(await screen.findByText(/marca es obligatoria/i)).toBeInTheDocument()
    expect(onGuardar).not.toHaveBeenCalled()
  })
})
