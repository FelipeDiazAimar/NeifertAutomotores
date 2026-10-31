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

  it('sin conSeguimiento no muestra tarea ni alerta', () => {
    render(<ClienteForm inicial={{ nombre: 'Ana' }} onGuardar={vi.fn()} />)
    expect(screen.queryByText(/tarea \(opcional\)/i)).toBeNull()
    expect(screen.queryByText(/alerta \(opcional\)/i)).toBeNull()
  })

  it('con conSeguimiento envía la tarea y la alerta junto al cliente', async () => {
    const onGuardar = vi.fn()
    render(<ClienteForm conSeguimiento inicial={{ nombre: 'Ana' }} onGuardar={onGuardar} />)
    const titulos = screen.getAllByLabelText('Título')
    await userEvent.type(titulos[0], 'Llamar')
    await userEvent.type(titulos[1], 'Mostrar el auto')
    const horas = screen.getAllByLabelText('Hora')
    await userEvent.type(horas[1], '10:30')
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(onGuardar).toHaveBeenCalledTimes(1)
    expect(onGuardar.mock.calls[0][0]).toMatchObject({
      nombre: 'Ana',
      tarea_titulo: 'Llamar',
      alerta_titulo: 'Mostrar el auto',
      alerta_hora: '10:30',
    })
  })

  it('una alerta sin hora no deja guardar', async () => {
    const onGuardar = vi.fn()
    render(<ClienteForm conSeguimiento inicial={{ nombre: 'Ana' }} onGuardar={onGuardar} />)
    await userEvent.type(screen.getAllByLabelText('Título')[1], 'Aviso')
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(await screen.findByText(/elegí la hora de la alerta/i)).toBeInTheDocument()
    expect(onGuardar).not.toHaveBeenCalled()
  })
})
