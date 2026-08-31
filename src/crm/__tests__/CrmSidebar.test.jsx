// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/services/supabaseClient', () => ({ supabase: { auth: { signOut: vi.fn() } } }))
vi.mock('../hooks/useCrmPerfil.js', () => ({ useCrmPerfil: () => ({ nombre: 'Bruno', usuario: 'Bruno', rol: 'vendedor' }) }))
const pendientes = vi.fn()
vi.mock('../hooks/useTareas.js', () => ({ useTareasPendientesHoy: () => pendientes() }))
const misVistas = vi.fn()
vi.mock('../hooks/useMisVistas.js', () => ({ useMisVistas: () => misVistas() }))
vi.mock('@/store/useUiStore', () => ({ useUiStore: (sel) => sel({ theme: 'light', toggleTheme: vi.fn() }) }))

const { default: CrmSidebar } = await import('../components/CrmSidebar.jsx')

const TODAS = ['panel', 'clientes', 'vehiculos', 'tareas', 'usuarios', 'roles']

describe('CrmSidebar', () => {
  it('muestra el badge de tareas pendientes de hoy', () => {
    pendientes.mockReturnValue({ data: 3 })
    misVistas.mockReturnValue({ vistas: TODAS, cargando: false })
    render(<MemoryRouter><CrmSidebar /></MemoryRouter>)
    const tareas = screen.getByRole('link', { name: /tareas/i })
    expect(tareas).toHaveTextContent('3')
  })

  it('sin pendientes no muestra badge', () => {
    pendientes.mockReturnValue({ data: 0 })
    misVistas.mockReturnValue({ vistas: TODAS, cargando: false })
    render(<MemoryRouter><CrmSidebar /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /tareas/i })).not.toHaveTextContent(/\d/)
  })

  it('el primer ítem es Panel (dashboard)', () => {
    pendientes.mockReturnValue({ data: 0 })
    misVistas.mockReturnValue({ vistas: TODAS, cargando: false })
    render(<MemoryRouter><CrmSidebar /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /panel/i })).toBeInTheDocument()
  })

  it('oculta los ítems fuera de las vistas del usuario', () => {
    pendientes.mockReturnValue({ data: 0 })
    misVistas.mockReturnValue({ vistas: ['panel', 'clientes', 'vehiculos', 'tareas'], cargando: false })
    render(<MemoryRouter><CrmSidebar /></MemoryRouter>)
    expect(screen.queryByRole('link', { name: /usuarios/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /roles/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /clientes/i })).toBeInTheDocument()
  })

  it('mientras carga muestra todo el NAV', () => {
    pendientes.mockReturnValue({ data: 0 })
    misVistas.mockReturnValue({ vistas: [], cargando: true })
    render(<MemoryRouter><CrmSidebar /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /usuarios/i })).toBeInTheDocument()
  })
})
