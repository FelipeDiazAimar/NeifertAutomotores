// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const listarParaRelevancia = vi.fn()
vi.mock('@/crm/services/vehiculos.service', () => ({
  listarParaRelevancia: (...a) => listarParaRelevancia(...a),
  guardarRelevancias: vi.fn(),
}))
vi.mock('@/crm/hooks/useCrmRealtime', () => ({ useCrmRealtime: () => {} }))

import RelevanciasPage from '../pages/RelevanciasPage.jsx'

const auto = (id, marca, modelo, anio, orden_relevancia) => ({
  id, marca, modelo, anio, orden_relevancia, estado: 'disponible', fotos: [], es_0km: false,
  duenio_nombre: 'Dueño', duenio_apellido: id,
})
const DATOS = [
  auto('1', 'Ford', 'Ka', 2019, 1),
  auto('2', 'Fiat', 'Cronos', 2021, 2),
  auto('3', 'Fiat', 'Argo', 2022, null),
  auto('4', 'Honda', 'Wave', 2020, null),
]

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <RelevanciasPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RelevanciasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarParaRelevancia.mockResolvedValue(DATOS)
  })

  it('reparte ranking y sin relevancia, y explica el orden de los de la derecha', async () => {
    montar()
    expect(await screen.findByText('Ford Ka')).toBeTruthy()
    expect(screen.getByText(/después del ranking, del más nuevo al más viejo/i)).toBeTruthy()
    expect(screen.getByText('Honda Wave')).toBeTruthy()
  })

  it('cada columna tiene su buscador y filtra solo esa columna', async () => {
    montar()
    await screen.findByText('Ford Ka')
    await userEvent.type(screen.getByLabelText('Buscar en Sin relevancia'), 'honda')
    expect(screen.getByText('Honda Wave')).toBeTruthy()
    expect(screen.queryByText('Fiat Argo')).toBeNull()
    expect(screen.getByText('Fiat Cronos')).toBeTruthy() // el ranking no se tocó
    expect(screen.getByText('1 de 2')).toBeTruthy()

    await userEvent.type(screen.getByLabelText('Buscar en Ranking del catálogo'), 'fiat')
    expect(screen.queryByText('Ford Ka')).toBeNull()
    // el # sigue siendo el de la lista completa
    const card = screen.getByText('Fiat Cronos').closest('div[class*="glass"]')
    expect(within(card).getByText('2')).toBeTruthy()
  })

  it('sin resultados lo avisa', async () => {
    montar()
    await screen.findByText('Ford Ka')
    await userEvent.type(screen.getByLabelText('Buscar en Sin relevancia'), 'zzzz')
    expect(screen.getByText(/ningún vehículo coincide/i)).toBeTruthy()
  })
})
