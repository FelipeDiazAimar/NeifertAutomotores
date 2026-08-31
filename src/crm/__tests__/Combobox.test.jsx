// @vitest-environment jsdom
import { useState } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Combobox from '../components/Combobox.jsx'

function Wrapper({ options }) {
  const [value, setValue] = useState('')
  return (
    <>
      <Combobox label="Marca" options={options} value={value} onChange={setValue} />
      <output data-testid="valor">{value}</output>
    </>
  )
}

const MARCAS = ['Ford', 'Toyota', 'Fiat']

describe('Combobox', () => {
  it('al enfocar muestra todas las opciones y elegir una setea el valor', async () => {
    render(<Wrapper options={MARCAS} />)
    await userEvent.click(screen.getByRole('textbox'))
    expect(screen.getByRole('button', { name: 'Toyota' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Toyota' }))
    expect(screen.getByTestId('valor')).toHaveTextContent('Toyota')
  })

  it('filtra las opciones por lo tipeado', async () => {
    render(<Wrapper options={MARCAS} />)
    await userEvent.type(screen.getByRole('textbox'), 'fi')

    expect(screen.getByRole('button', { name: 'Fiat' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Toyota' })).not.toBeInTheDocument()
  })

  it('ofrece usar un valor nuevo que no está en la lista', async () => {
    render(<Wrapper options={MARCAS} />)
    await userEvent.type(screen.getByRole('textbox'), 'Mazda')

    expect(screen.getByRole('button', { name: /Usar «Mazda»/ })).toBeInTheDocument()
    expect(screen.getByTestId('valor')).toHaveTextContent('Mazda')
  })

  it('no ofrece "usar" cuando lo tipeado coincide con una opción (ignora mayúsculas)', async () => {
    render(<Wrapper options={MARCAS} />)
    await userEvent.type(screen.getByRole('textbox'), 'ford')

    expect(screen.queryByRole('button', { name: /Usar «/ })).not.toBeInTheDocument()
  })
})
