// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const listar = vi.fn()
vi.mock('@/crm/services/fotos.service', () => ({ listar: (...args) => listar(...args) }))

import VehiculoFotoCarousel from '../components/VehiculoFotoCarousel'

function renderCarousel(props = {}) {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <VehiculoFotoCarousel vehiculoId="v1" patente="AB123CD" {...props} />
    </QueryClientProvider>,
  )
}

describe('VehiculoFotoCarousel', () => {
  it('sin fotos, muestra la patente como placeholder', async () => {
    listar.mockResolvedValue([])
    renderCarousel()
    expect(await screen.findByText('AB123CD')).toBeInTheDocument()
  })

  it('si la foto actual no carga, cae al placeholder y loguea en consola', async () => {
    listar.mockResolvedValue([{ id: 'f1', url: 'https://r2/rota.jpg', es_portada: true }])
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = renderCarousel()
    await waitFor(() => expect(container.querySelector('img')).toBeInTheDocument())
    fireEvent.error(container.querySelector('img'))
    await waitFor(() => expect(screen.getByText('AB123CD')).toBeInTheDocument())
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})
