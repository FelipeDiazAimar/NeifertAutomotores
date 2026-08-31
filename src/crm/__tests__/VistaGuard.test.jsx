// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const misVistas = vi.fn()
vi.mock('../hooks/useMisVistas.js', () => ({ useMisVistas: () => misVistas() }))

const { default: VistaGuard } = await import('../routes/VistaGuard.jsx')

function renderEn(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<VistaGuard />}>
          <Route path="/crm" element={<div>PANEL OK</div>} />
          <Route path="/crm/clientes" element={<div>CLIENTES OK</div>} />
          <Route path="/crm/roles" element={<div>ROLES OK</div>} />
          <Route path="/crm/cambiar-password" element={<div>PASS OK</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('VistaGuard', () => {
  it('deja pasar una vista habilitada', () => {
    misVistas.mockReturnValue({ vistas: ['panel', 'clientes'], cargando: false })
    renderEn('/crm/clientes')
    expect(screen.getByText('CLIENTES OK')).toBeInTheDocument()
  })

  it('bloquea una vista no habilitada con el mensaje', () => {
    misVistas.mockReturnValue({ vistas: ['panel', 'clientes'], cargando: false })
    renderEn('/crm/roles')
    expect(screen.getByText(/no tenés acceso a esta sección/i)).toBeInTheDocument()
    expect(screen.queryByText('ROLES OK')).not.toBeInTheDocument()
  })

  it('rutas sin gate pasan siempre', () => {
    misVistas.mockReturnValue({ vistas: [], cargando: false })
    renderEn('/crm/cambiar-password')
    expect(screen.getByText('PASS OK')).toBeInTheDocument()
  })

  it('mientras carga muestra el spinner, no el contenido', () => {
    misVistas.mockReturnValue({ vistas: [], cargando: true })
    renderEn('/crm')
    expect(screen.queryByText('PANEL OK')).not.toBeInTheDocument()
  })
})
