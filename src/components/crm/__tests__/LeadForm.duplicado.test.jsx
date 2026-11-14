// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const buscarPorTelefono = vi.fn()
vi.mock('@/crm/services/clientes.service', () => ({ buscarPorTelefono: (...a) => buscarPorTelefono(...a) }))
vi.mock('@/crm/hooks/useClientes', () => ({
  useClienteMutations: () => ({ crearCompleto: { mutateAsync: vi.fn(), isPending: false } }),
}))
vi.mock('@/crm/hooks/useTareas', () => ({ useTareaMutations: () => ({ crear: { mutateAsync: vi.fn() } }) }))
vi.mock('@/crm/hooks/useAlertas', () => ({ useAlertaMutations: () => ({ crear: { mutateAsync: vi.fn() } }) }))
vi.mock('@/crm/hooks/useCrmUsuarios', () => ({ useCrmUsuarios: () => ({ data: [] }) }))
vi.mock('@/crm/hooks/useCrmPerfil', () => ({ useCrmPerfil: () => ({ id: 'u1' }) }))

import LeadForm from '../LeadForm.jsx'

const EXISTENTE = { id: 'c9', nombre: 'María Gómez', telefono: '3492 12-3456', status: 'activo', creado_en: '2026-01-05T12:00:00Z', archivado_en: null }

function montar() {
  render(
    <MemoryRouter initialEntries={['/nuevo']}>
      <Routes>
        <Route path="/nuevo" element={<LeadForm />} />
        <Route path="/crm/clientes/:id" element={<p>FICHA</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function cargarTelefono() {
  await userEvent.type(screen.getByLabelText('Teléfono'), '3492123456')
  await userEvent.tab()
}

describe('LeadForm — teléfono ya registrado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    buscarPorTelefono.mockResolvedValue([])
  })

  it('sin coincidencias no muestra el modal', async () => {
    montar()
    await cargarTelefono()
    await vi.waitFor(() => expect(buscarPorTelefono).toHaveBeenCalledWith('3492123456'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('con coincidencia muestra el modal y "Ver ficha" navega al cliente', async () => {
    buscarPorTelefono.mockResolvedValue([EXISTENTE])
    montar()
    await cargarTelefono()
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText('María Gómez')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /ver ficha/i }))
    expect(await screen.findByText('FICHA')).toBeTruthy()
  })

  it('"Continuar" y cerrar con la X lo cierran y no vuelve a avisar por el mismo número', async () => {
    buscarPorTelefono.mockResolvedValue([EXISTENTE])
    montar()
    await cargarTelefono()
    await userEvent.click(await screen.findByRole('button', { name: /continuar con la carga/i }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await userEvent.click(screen.getByLabelText('Teléfono'))
    await userEvent.tab()
    expect(buscarPorTelefono).toHaveBeenCalledTimes(1)
  })

  it('cerrar con la X equivale a continuar', async () => {
    buscarPorTelefono.mockResolvedValue([EXISTENTE])
    montar()
    await cargarTelefono()
    await userEvent.click(await screen.findByRole('button', { name: /cerrar/i }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
