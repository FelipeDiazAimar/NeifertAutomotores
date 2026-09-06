// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthContext } from '@/context/authContext'
import CrmProtectedRoute from '../routes/CrmProtectedRoute.jsx'

function renderAt(value) {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={['/crm/x']}>
        <Routes>
          <Route path="/crm/login" element={<div>LOGIN</div>} />
          <Route element={<CrmProtectedRoute />}>
            <Route path="/crm/x" element={<div>PRIVADO</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('CrmProtectedRoute', () => {
  it('sin sesión → redirige a login', () => {
    renderAt({ session: null, loading: false, crmPerfil: null, crmPerfilCargando: false })
    expect(screen.getByText('LOGIN')).toBeInTheDocument()
  })

  it('con sesión pero sin perfil crm → pantalla sin acceso', () => {
    renderAt({ session: { user: { id: '1' } }, loading: false, crmPerfil: null, crmPerfilCargando: false })
    expect(screen.getByText(/no tiene acceso/i)).toBeInTheDocument()
  })

  it('con sesión y perfil activo → contenido', () => {
    renderAt({
      session: { user: { id: '1' } }, loading: false,
      crmPerfil: { rol: 'vendedor', activo: true }, crmPerfilCargando: false,
    })
    expect(screen.getByText('PRIVADO')).toBeInTheDocument()
  })

  it('cargando → ni login ni contenido todavía', () => {
    renderAt({ session: { user: { id: '1' } }, loading: false, crmPerfil: null, crmPerfilCargando: true })
    expect(screen.queryByText('PRIVADO')).not.toBeInTheDocument()
    expect(screen.queryByText('LOGIN')).not.toBeInTheDocument()
  })
})
