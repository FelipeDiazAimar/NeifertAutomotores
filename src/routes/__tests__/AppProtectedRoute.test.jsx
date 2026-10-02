// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AppProtectedRoute from '../AppProtectedRoute'

vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/crm/hooks/useCrmPerfil', () => ({ useCrmPerfil: vi.fn() }))

import { useAuth } from '@/hooks/useAuth'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/crm/login" element={<div>login page</div>} />
        <Route element={<AppProtectedRoute />}>
          <Route path="/admin/x" element={<div>contenido protegido</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('AppProtectedRoute', () => {
  it('sin sesión, redirige a /crm/login', () => {
    useAuth.mockReturnValue({ session: null, loading: false })
    useCrmPerfil.mockReturnValue({ activo: false, cargando: false })
    renderAt('/admin/x')
    expect(screen.getByText('login page')).toBeInTheDocument()
  })

  it('con sesión pero sin crm.usuarios activo, muestra "no tenés acceso"', () => {
    useAuth.mockReturnValue({ session: { user: { id: '1' } }, loading: false })
    useCrmPerfil.mockReturnValue({ activo: false, cargando: false })
    renderAt('/admin/x')
    expect(screen.getByText(/no tenés acceso/i)).toBeInTheDocument()
  })

  it('con sesión y activo, renderiza el contenido', () => {
    useAuth.mockReturnValue({ session: { user: { id: '1' } }, loading: false })
    useCrmPerfil.mockReturnValue({ activo: true, cargando: false })
    renderAt('/admin/x')
    expect(screen.getByText('contenido protegido')).toBeInTheDocument()
  })
})
