import { describe, it, expect, beforeEach } from 'vitest'
import { useAlertasFiltros, FILTROS_VACIOS } from '../store/useAlertasFiltros.js'

beforeEach(() => useAlertasFiltros.setState({ filtros: { ...FILTROS_VACIOS }, incluirHechas: false }))

describe('useAlertasFiltros', () => {
  it('setFiltro cambia un filtro y contarFiltrosActivos lo refleja', () => {
    expect(useAlertasFiltros.getState().contarFiltrosActivos()).toBe(0)
    useAlertasFiltros.getState().setFiltro('asignadoA', 'u1')
    expect(useAlertasFiltros.getState().contarFiltrosActivos()).toBe(1)
  })
  it('resetFiltros vuelve todo a blanco', () => {
    useAlertasFiltros.getState().setFiltro('asignadoA', 'u1')
    useAlertasFiltros.getState().setIncluirHechas(true)
    useAlertasFiltros.getState().resetFiltros()
    expect(useAlertasFiltros.getState().contarFiltrosActivos()).toBe(0)
  })
})
