import { describe, it, expect, beforeEach } from 'vitest'
import { useSeleccionVehiculos } from '../store/useSeleccionVehiculos.js'

beforeEach(() => useSeleccionVehiculos.setState({ modoSeleccion: false, ids: [] }))

describe('useSeleccionVehiculos', () => {
  it('estado inicial: modo apagado y sin ids', () => {
    const s = useSeleccionVehiculos.getState()
    expect(s.modoSeleccion).toBe(false)
    expect(s.ids).toEqual([])
  })

  it('toggleId agrega y quita', () => {
    useSeleccionVehiculos.getState().toggleId('a')
    expect(useSeleccionVehiculos.getState().ids).toEqual(['a'])
    useSeleccionVehiculos.getState().toggleId('b')
    expect(useSeleccionVehiculos.getState().ids).toEqual(['a', 'b'])
    useSeleccionVehiculos.getState().toggleId('a')
    expect(useSeleccionVehiculos.getState().ids).toEqual(['b'])
  })

  it('seleccionarTodos reemplaza los ids', () => {
    useSeleccionVehiculos.getState().toggleId('x')
    useSeleccionVehiculos.getState().seleccionarTodos(['a', 'b', 'c'])
    expect(useSeleccionVehiculos.getState().ids).toEqual(['a', 'b', 'c'])
  })

  it('limpiar vacía ids', () => {
    useSeleccionVehiculos.getState().seleccionarTodos(['a', 'b'])
    useSeleccionVehiculos.getState().limpiar()
    expect(useSeleccionVehiculos.getState().ids).toEqual([])
  })

  it('salir apaga el modo y vacía ids', () => {
    useSeleccionVehiculos.getState().setModoSeleccion(true)
    useSeleccionVehiculos.getState().seleccionarTodos(['a', 'b'])
    useSeleccionVehiculos.getState().salir()
    const s = useSeleccionVehiculos.getState()
    expect(s.modoSeleccion).toBe(false)
    expect(s.ids).toEqual([])
  })

  it('setModoSeleccion(false) vacía ids', () => {
    useSeleccionVehiculos.getState().setModoSeleccion(true)
    useSeleccionVehiculos.getState().seleccionarTodos(['a', 'b'])
    useSeleccionVehiculos.getState().setModoSeleccion(false)
    const s = useSeleccionVehiculos.getState()
    expect(s.modoSeleccion).toBe(false)
    expect(s.ids).toEqual([])
  })
})
