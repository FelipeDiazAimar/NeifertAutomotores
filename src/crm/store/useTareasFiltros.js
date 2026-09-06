import { create } from 'zustand'

export const FILTROS_VACIOS = {
  asignadoA: 'todos', // 'todos' | 'mias' (el hook mapea 'mias' → id) | <id>
  prioridad: [],
  soloConCliente: false,
}

export const useTareasFiltros = create((set) => ({
  filtros: { ...FILTROS_VACIOS },
  incluirHechas: false,
  incluirArchivadas: false,

  setFiltro: (clave, valor) => set((s) => ({ filtros: { ...s.filtros, [clave]: valor } })),
  setIncluirHechas: (v) => set({ incluirHechas: v }),
  setIncluirArchivadas: (v) => set({ incluirArchivadas: v }),
  resetFiltros: () => set({ filtros: { ...FILTROS_VACIOS }, incluirHechas: false, incluirArchivadas: false }),

  contarFiltrosActivos: () => {
    const { filtros, incluirHechas, incluirArchivadas } = useTareasFiltros.getState()
    let n = 0
    if (filtros.asignadoA !== 'todos') n++
    if (filtros.prioridad.length) n++
    if (filtros.soloConCliente) n++
    if (incluirHechas) n++
    if (incluirArchivadas) n++
    return n
  },
}))
