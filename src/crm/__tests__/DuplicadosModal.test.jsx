// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const listarParaDuplicados = vi.fn()
const eliminarSvc = vi.fn()
vi.mock('@/crm/services/clientes.service', () => ({
  listarParaDuplicados: (...a) => listarParaDuplicados(...a),
  eliminar: (...a) => eliminarSvc(...a),
}))
vi.mock('@/crm/hooks/useCrmPerfil', () => ({ useCrmPerfil: () => ({ id: 'u1' }) }))

import DuplicadosModal from '../components/DuplicadosModal.jsx'

const fila = (o) => ({ canal: 'whatsapp', status: 'activo', intereses: [], autos_entrega: [], archivado_en: null, ...o })
const CLIENTES = [
  fila({ id: 'g1', nombre: 'Guillermo Scarello', telefono: '3564664196', creado_en: '2026-11-12T10:55:00Z' }),
  fila({ id: 'g2', nombre: 'Guillermo Scarello', telefono: '3564664196', creado_en: '2026-11-12T11:02:00Z', intereses: [{ id: 'i' }] }),
  fila({ id: 'p1', nombre: 'Ana Pérez', telefono: '3492111111', creado_en: '2026-06-01T10:00:00Z', canal: 'salon' }),
  fila({ id: 'p2', nombre: 'Luis Pérez', telefono: '3492 11-1111', creado_en: '2026-06-02T10:00:00Z', canal: 'salon' }),
  fila({ id: 'u1', nombre: 'Único', telefono: '3000000000', creado_en: '2026-01-01T10:00:00Z' }),
]

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DuplicadosModal open onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DuplicadosModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarParaDuplicados.mockResolvedValue(CLIENTES)
    eliminarSvc.mockResolvedValue()
  })

  it('lista solo los teléfonos repetidos y marca los de mismo nombre', async () => {
    montar()
    expect(await screen.findByText('2 teléfonos repetidos')).toBeTruthy()
    expect(screen.getAllByText('Guillermo Scarello')).toHaveLength(2)
    expect(screen.queryByText('Único')).toBeNull()
    expect(screen.getByText(/probable duplicado/i)).toBeTruthy()
    expect(screen.getByText(/número compartido/i)).toBeTruthy()
  })

  it('el buscador y los filtros acotan los grupos', async () => {
    montar()
    await screen.findByText('2 teléfonos repetidos')
    await userEvent.type(screen.getByPlaceholderText(/buscar por nombre/i), 'scarello')
    expect(await screen.findByText('1 teléfono repetido')).toBeTruthy()
    await userEvent.clear(screen.getByPlaceholderText(/buscar por nombre/i))
    await userEvent.click(screen.getByRole('button', { name: /^salón$/i }))
    expect(await screen.findByText('1 teléfono repetido')).toBeTruthy()
    expect(screen.queryByText('Guillermo Scarello')).toBeNull()
  })

  it('eliminar pide confirmación y recién ahí borra', async () => {
    montar()
    await screen.findByText('2 teléfonos repetidos')
    await userEvent.click(screen.getAllByRole('button', { name: /eliminar este/i })[1])
    const dialogo = await screen.findByRole('dialog', { name: /eliminar este cliente/i })
    expect(eliminarSvc).not.toHaveBeenCalled()
    expect(within(dialogo).getByText(/1 vehículos de interés/i)).toBeTruthy()
    await userEvent.click(within(dialogo).getByRole('button', { name: /sí, eliminar/i }))
    await vi.waitFor(() => expect(eliminarSvc).toHaveBeenCalledWith('g2'))
  })

  it('cancelar la confirmación no borra', async () => {
    montar()
    await screen.findByText('2 teléfonos repetidos')
    await userEvent.click(screen.getAllByRole('button', { name: /eliminar este/i })[0])
    const dialogo = await screen.findByRole('dialog', { name: /eliminar este cliente/i })
    await userEvent.click(within(dialogo).getByRole('button', { name: /cancelar/i }))
    expect(eliminarSvc).not.toHaveBeenCalled()
  })
})
