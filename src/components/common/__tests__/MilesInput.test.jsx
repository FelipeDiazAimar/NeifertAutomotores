// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import MilesInput from '../MilesInput'

function Harness({ onSubmit }) {
  const { control, handleSubmit } = useForm({ defaultValues: { precio: undefined } })
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <MilesInput control={control} name="precio" label="Precio" />
      <button type="submit">Guardar</button>
    </form>
  )
}

describe('MilesInput', () => {
  it('muestra puntos de miles mientras se tipea', async () => {
    render(<Harness onSubmit={() => {}} />)
    await userEvent.type(screen.getByLabelText('Precio'), '21000000')
    expect(screen.getByLabelText('Precio')).toHaveValue('21.000.000')
  })

  it('el valor que llega al form es el número plano, sin puntos', async () => {
    let enviado = null
    render(<Harness onSubmit={(v) => { enviado = v }} />)
    await userEvent.type(screen.getByLabelText('Precio'), '21000000')
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(enviado).toEqual({ precio: 21000000 })
  })

  it('vacío no rompe nada (nunca se tocó el campo)', async () => {
    let enviado = null
    render(<Harness onSubmit={(v) => { enviado = v }} />)
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(enviado).toEqual({ precio: undefined })
  })

  it('borrar todo lo tipeado deja el campo vacío', async () => {
    let enviado = null
    render(<Harness onSubmit={(v) => { enviado = v }} />)
    const input = screen.getByLabelText('Precio')
    await userEvent.type(input, '5000')
    await userEvent.clear(input)
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(enviado).toEqual({ precio: '' })
  })
})
