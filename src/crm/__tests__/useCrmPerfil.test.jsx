// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { AuthContext } from '@/context/authContext'
import { useCrmPerfil } from '../hooks/useCrmPerfil.js'

const wrapper =
  (value) =>
  ({ children }) => <AuthContext.Provider value={value}>{children}</AuthContext.Provider>

describe('useCrmPerfil', () => {
  it('deriva esAdmin del rol', () => {
    const { result } = renderHook(() => useCrmPerfil(), {
      wrapper: wrapper({
        crmPerfil: { id: '1', usuario: 'Cris', nombre: 'Cris', rol: 'admin', activo: true },
        crmPerfilCargando: false,
      }),
    })
    expect(result.current.esAdmin).toBe(true)
    expect(result.current.usuario).toBe('Cris')
    expect(result.current.activo).toBe(true)
  })

  it('vendedor → esAdmin false', () => {
    const { result } = renderHook(() => useCrmPerfil(), {
      wrapper: wrapper({ crmPerfil: { rol: 'vendedor', activo: true }, crmPerfilCargando: false }),
    })
    expect(result.current.esAdmin).toBe(false)
  })

  it('sin perfil → cargando / valores null', () => {
    const { result } = renderHook(() => useCrmPerfil(), {
      wrapper: wrapper({ crmPerfil: null, crmPerfilCargando: true }),
    })
    expect(result.current.esAdmin).toBe(false)
    expect(result.current.activo).toBe(false)
    expect(result.current.cargando).toBe(true)
  })
})
