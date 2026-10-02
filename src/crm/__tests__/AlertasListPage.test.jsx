// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const listar = vi.fn().mockResolvedValue([
  { id: 1, titulo: 'ITV Cronos', fecha: '2020-01-01', hora: '10:00', hecha: false, asignado: { nombre: 'Bruno' } },
  { id: 2, titulo: 'Llamar a Juan', fecha: '2020-01-02', hora: '11:00', hecha: true, asignado: { nombre: 'Bruno' } },
])
vi.mock('@/crm/services/alertas.service', () => ({
  listar: (...a) => listar(...a), toggleHecha: vi.fn(), eliminar: vi.fn(), crear: vi.fn(), actualizar: vi.fn(),
}))
vi.mock('@/crm/hooks/useCrmPerfil', () => ({ useCrmPerfil: vi.fn() }))
vi.mock('@/crm/hooks/useCrmRealtime', () => ({ useCrmRealtime: () => {} }))

import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import AlertasListPage from '../pages/AlertasListPage'

function renderPage(perfil = { id: 'u1', esAdmin: true, rol: 'admin' }) {
  useCrmPerfil.mockReturnValue(perfil)
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><AlertasListPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AlertasListPage', () => {
  it('lista alertas agrupadas (vencida, en este caso)', async () => {
    renderPage()
    expect(await screen.findByText('ITV Cronos')).toBeInTheDocument()
    expect(screen.getByText(/Vencidas/)).toBeInTheDocument()
  })

  it('siempre trae las leídas y las deja abajo en Historial (no se borran)', async () => {
    renderPage()
    expect(await screen.findByText('ITV Cronos')).toBeInTheDocument()
    expect(listar).toHaveBeenCalledWith(expect.objectContaining({ incluirHechas: true }))
    fireEvent.click(screen.getByText(/Historial/))
    expect(screen.getByText('Llamar a Juan')).toBeInTheDocument()
  })

  it('el botón Probar avisos solo lo ve admin/dueno', async () => {
    renderPage()
    expect(await screen.findByRole('button', { name: /probar avisos/i })).toBeInTheDocument()
  })

  it('un vendedor no ve el botón Probar avisos', async () => {
    renderPage({ id: 'u2', esAdmin: false, rol: 'vendedor' })
    expect(await screen.findByText('ITV Cronos')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /probar avisos/i })).not.toBeInTheDocument()
  })
})
