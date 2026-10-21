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
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ session: null, isDemo: true }) }))

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

  it('sin la vista no muestra Presupuestos', () => {
    render(<MemoryRouter><AppSidebar /></MemoryRouter>)
    expect(screen.queryByText('Presupuestos')).not.toBeInTheDocument()
  })

  it('con la vista muestra Presupuestos y apunta a /crm/presupuestos', async () => {
    vi.resetModules()
    vi.doMock('@/crm/hooks/useMisVistas', () => ({
      useMisVistas: () => ({ vistas: ['panel', 'presupuestos'], cargando: false }),
    }))
    const { default: SidebarConPresupuestos } = await import('../AppSidebar')
    render(
      <MemoryRouter>
        <SidebarConPresupuestos />
      </MemoryRouter>,
    )
    const link = screen.getByText('Presupuestos').closest('a')
    expect(link).toHaveAttribute('href', '/crm/presupuestos')
  })
})
