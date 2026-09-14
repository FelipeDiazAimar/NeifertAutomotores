// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppSidebar from '../AppSidebar'

vi.mock('@/services/supabaseClient', () => ({ supabase: { auth: { signOut: vi.fn() } } }))
vi.mock('@/store/useUiStore', () => ({ useUiStore: (sel) => sel({ theme: 'light', toggleTheme: vi.fn() }) }))
vi.mock('@/crm/hooks/useMisVistas', () => ({
  useMisVistas: () => ({ vistas: ['panel', 'leads', 'vehiculos', 'clientes'], cargando: false }),
}))
vi.mock('@/crm/hooks/useTareas', () => ({ useTareasPendientesHoy: () => ({ data: 0 }) }))
vi.mock('@/crm/hooks/useCrmPerfil', () => ({
  useCrmPerfil: () => ({ nombre: 'Test', usuario: 'test', rol: 'admin' }),
}))

describe('AppSidebar', () => {
  it('muestra solo los ítems de las vistas permitidas', () => {
    render(<MemoryRouter><AppSidebar /></MemoryRouter>)
    expect(screen.getByText('Carga Leads')).toBeInTheDocument()
    expect(screen.getByText('Clientes')).toBeInTheDocument()
    expect(screen.queryByText('Tareas')).not.toBeInTheDocument()
    expect(screen.queryByText('Peritaje')).not.toBeInTheDocument()
  })

  it('etiqueta Catálogo aparece y apunta a /crm/vehiculos', () => {
    render(<MemoryRouter><AppSidebar /></MemoryRouter>)
    const link = screen.getByText('Catálogo').closest('a')
    expect(link).toHaveAttribute('href', '/crm/vehiculos')
  })

  it('Panel aparece cuando esa vista está habilitada y apunta a /crm', () => {
    render(<MemoryRouter><AppSidebar /></MemoryRouter>)
    const link = screen.getByText('Panel').closest('a')
    expect(link).toHaveAttribute('href', '/crm')
  })
})
