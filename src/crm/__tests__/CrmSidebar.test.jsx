// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/services/supabaseClient', () => ({ supabase: { auth: { signOut: vi.fn() } } }))
vi.mock('../hooks/useCrmPerfil.js', () => ({ useCrmPerfil: () => ({ nombre: 'Bruno', usuario: 'Bruno', rol: 'vendedor' }) }))
const pendientes = vi.fn()
vi.mock('../hooks/useTareas.js', () => ({ useTareasPendientesHoy: () => pendientes() }))
vi.mock('@/store/useUiStore', () => ({ useUiStore: (sel) => sel({ theme: 'light', toggleTheme: vi.fn() }) }))

const { default: CrmSidebar } = await import('../components/CrmSidebar.jsx')

describe('CrmSidebar', () => {
  it('muestra el badge de tareas pendientes de hoy', () => {
    pendientes.mockReturnValue({ data: 3 })
    render(<MemoryRouter><CrmSidebar /></MemoryRouter>)
    const tareas = screen.getByRole('link', { name: /tareas/i })
    expect(tareas).toHaveTextContent('3')
  })

  it('sin pendientes no muestra badge', () => {
    pendientes.mockReturnValue({ data: 0 })
    render(<MemoryRouter><CrmSidebar /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /tareas/i })).not.toHaveTextContent(/\d/)
  })

  it('el primer ítem es Panel (dashboard)', () => {
    pendientes.mockReturnValue({ data: 0 })
    render(<MemoryRouter><CrmSidebar /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /panel/i })).toBeInTheDocument()
  })
})
