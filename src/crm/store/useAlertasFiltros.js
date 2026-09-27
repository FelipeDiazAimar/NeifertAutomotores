import { create } from 'zustand'

export const FILTROS_VACIOS = { asignadoA: 'todos' }

// Las leídas no son un filtro: siempre se traen y viven en la sección
// Historial al pie de la página.
export const useAlertasFiltros = create((set) => ({
  filtros: { ...FILTROS_VACIOS },
  setFiltro: (clave, valor) => set((s) => ({ filtros: { ...s.filtros, [clave]: valor } })),
  resetFiltros: () => set({ filtros: { ...FILTROS_VACIOS } }),
  contarFiltrosActivos: () => {
    const { filtros } = useAlertasFiltros.getState()
    let n = 0
    if (filtros.asignadoA !== 'todos') n++
    return n
  },
}))
