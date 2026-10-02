import { create } from 'zustand'

/** Estado de UI de la lista de Peritaje (búsqueda, estado, orden, tipos),
 *  fuera del árbol de componentes para que sobreviva a la navegación. */
export const usePeritajeFiltros = create((set) => ({
  busqueda: '',
  estado: null,
  orden: 'marca-asc',
  tipos: [],
  mostrarFiltros: false,

  setBusqueda: (busqueda) => set({ busqueda }),
  setEstado: (estado) => set({ estado }),
  setOrden: (orden) => set({ orden }),
  toggleTipo: (t) =>
    set((s) => ({ tipos: s.tipos.includes(t) ? s.tipos.filter((x) => x !== t) : [...s.tipos, t] })),
  setMostrarFiltros: (mostrarFiltros) => set({ mostrarFiltros }),
}))
