// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const listar = vi.fn().mockResolvedValue([
  { id: 1, titulo: 'ITV Cronos', fecha: '2020-01-01', hora: '10:00', hecha: false, asignado: { nombre: 'Bruno' } },
])
vi.mock('@/crm/services/alertas.service', () => ({
  listar: (...a) => listar(...a), toggleHecha: vi.fn(), eliminar: vi.fn(), crear: vi.fn(), actualizar: vi.fn(),
}))
vi.mock('@/crm/hooks/useCrmPerfil', () => ({ useCrmPerfil: () => ({ id: 'u1', esAdmin: true }) }))
vi.mock('@/crm/hooks/useCrmRealtime', () => ({ useCrmRealtime: () => {} }))

import AlertasListPage from '../pages/AlertasListPage'

describe('AlertasListPage', () => {
  it('lista alertas agrupadas (vencida, en este caso)', async () => {
    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><AlertasListPage /></MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('ITV Cronos')).toBeInTheDocument()
    expect(screen.getByText(/Vencidas/)).toBeInTheDocument()
  })
})
