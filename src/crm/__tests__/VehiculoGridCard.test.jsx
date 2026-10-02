// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/services/events.service', () => ({
  fetchVehicleStats: vi.fn().mockResolvedValue({ views: 3, conversions: 1, rate: 33.3 }),
}))

import VehiculoGridCard from '../components/VehiculoGridCard.jsx'

const vehiculo = {
  id: 'v1', marca: 'Toyota', modelo: 'Hilux', version: 'SRX', patente: 'AB123CD',
  anio: 2020, km: 45000, moneda: 'USD', precio_contado: 32000, estado: 'disponible',
  publicado: true, fotos: [],
}

function renderCard(props = {}) {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <VehiculoGridCard vehiculo={vehiculo} onCambiarEstado={vi.fn()} onCambiarPublicado={vi.fn()} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('VehiculoGridCard', () => {
  it('muestra marca, modelo, precio y specs', () => {
    renderCard()
    expect(screen.getByText('Toyota')).toBeInTheDocument()
    expect(screen.getByText(/Hilux/)).toBeInTheDocument()
    expect(screen.getByText(/32\.000/)).toBeInTheDocument()
    expect(screen.getByText(/2020/)).toBeInTheDocument()
  })

  it('el ícono de ocultar/mostrar dispara onCambiarPublicado', async () => {
    const onCambiarPublicado = vi.fn()
    renderCard({ onCambiarPublicado })
    await userEvent.click(screen.getByRole('button', { name: /ocultar al público/i }))
    expect(onCambiarPublicado).toHaveBeenCalledWith(vehiculo, false)
  })

  it('vehículo no publicado muestra el badge "Oculto"', () => {
    renderCard({ vehiculo: { ...vehiculo, publicado: false } })
    expect(screen.getByText('Oculto')).toBeInTheDocument()
  })
})
