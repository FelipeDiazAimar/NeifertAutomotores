import { create } from 'zustand'

export const FILTROS_VACIOS = { asignadoA: 'todos' }

export const useAlertasFiltros = create((set) => ({
  filtros: { ...FILTROS_VACIOS },
  incluirHechas: false,
  setFiltro: (clave, valor) => set((s) => ({ filtros: { ...s.filtros, [clave]: valor } })),
  setIncluirHechas: (v) => set({ incluirHechas: v }),
  resetFiltros: () => set({ filtros: { ...FILTROS_VACIOS }, incluirHechas: false }),
  contarFiltrosActivos: () => {
    const { filtros, incluirHechas } = useAlertasFiltros.getState()
    let n = 0
    if (filtros.asignadoA !== 'todos') n++
    if (incluirHechas) n++
    return n
  },
}))
