import { create } from 'zustand'

export const FILTROS_VACIOS = {
  estado: [],
  tipo: [],
  moneda: '',
  anioMin: '',
  anioMax: '',
  precioMin: '',
  precioMax: '',
  incluirArchivados: false,
}

const ORDEN_INICIAL = { campo: 'creado_en', dir: 'desc' }

/** Estado de UI de la lista de vehículos (búsqueda, filtros, orden, página). */
export const useVehiculosFiltros = create((set) => ({
  busqueda: '',
  filtros: { ...FILTROS_VACIOS },
  orden: { ...ORDEN_INICIAL },
  pagina: 1,

  setBusqueda: (busqueda) => set({ busqueda, pagina: 1 }),
  setFiltro: (clave, valor) =>
    set((s) => ({ filtros: { ...s.filtros, [clave]: valor }, pagina: 1 })),
  resetFiltros: () => set({ filtros: { ...FILTROS_VACIOS }, pagina: 1 }),
  setOrden: (orden) => set({ orden, pagina: 1 }),
  setPagina: (pagina) => set({ pagina }),

  contarFiltrosActivos: () => {
    const f = useVehiculosFiltros.getState().filtros
    let n = 0
    if (f.estado.length) n++
    if (f.tipo.length) n++
    if (f.moneda) n++
    if (f.anioMin || f.anioMax) n++
    if (f.precioMin || f.precioMax) n++
    if (f.incluirArchivados) n++
    return n
  },
}))
