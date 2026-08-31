// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import OportunidadesList from '../components/OportunidadesList.jsx'

const detalle = [{ key: 'marca', label: 'Marca', aplica: true, ok: true, clienteDice: 'Ford', vehiculoDice: 'Ford' }]

const item = (id) => ({
  vehiculo: { id, marca: 'Ford', modelo: 'KA', version: '', anio: 2016, fotos: [] },
  clientes: [{ cliente: { id: 'c1', nombre: 'Ana', notas: null }, score: 100, bucket: 'alta', detalle }],
})

const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('OportunidadesList', () => {
  it('vacío → empty state', () => {
    wrap(<OportunidadesList items={[]} />)
    expect(screen.getByText(/no hay oportunidades/i)).toBeInTheDocument()
  })

  it('muestra vehículo + cliente + % y abre el detalle', async () => {
    wrap(<OportunidadesList items={[item('v1')]} />)
    expect(screen.getByText(/Ford KA/)).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /detalle/i }))
    expect(await screen.findByText(/Alta compatibilidad/)).toBeInTheDocument()
  })

  it('más de 20 items → "Ver más"', async () => {
    const items = Array.from({ length: 25 }, (_, i) => item('v' + i))
    wrap(<OportunidadesList items={items} />)
    const verMas = screen.getByRole('button', { name: /ver más/i })
    expect(verMas).toBeInTheDocument()
    await userEvent.click(verMas)
    expect(screen.queryByRole('button', { name: /ver más/i })).not.toBeInTheDocument()
  })
})
