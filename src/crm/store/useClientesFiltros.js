import { create } from 'zustand'

export const FILTROS_VACIOS = {
  status: [],
  canal: [],
  conAutoEntrega: false,
  interesCeroKm: false,
  incluirArchivados: false,
}

const ORDEN_INICIAL = { campo: 'creado_en', dir: 'desc' }

export const useClientesFiltros = create((set) => ({
  busqueda: '',
  filtros: { ...FILTROS_VACIOS },
  orden: { ...ORDEN_INICIAL },
  pagina: 1,

  setBusqueda: (busqueda) => set({ busqueda, pagina: 1 }),
  setFiltro: (clave, valor) => set((s) => ({ filtros: { ...s.filtros, [clave]: valor }, pagina: 1 })),
  resetFiltros: () => set({ filtros: { ...FILTROS_VACIOS }, pagina: 1 }),
  setOrden: (orden) => set({ orden, pagina: 1 }),
  setPagina: (pagina) => set({ pagina }),

  contarFiltrosActivos: () => {
    const f = useClientesFiltros.getState().filtros
    let n = 0
    if (f.status.length) n++
    if (f.canal.length) n++
    if (f.conAutoEntrega) n++
    if (f.interesCeroKm) n++
    if (f.incluirArchivados) n++
    return n
  },
}))
