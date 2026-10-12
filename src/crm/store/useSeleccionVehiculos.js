import { create } from 'zustand'

export const useSeleccionVehiculos = create((set) => ({
  modoSeleccion: false,   // boolean: modo selección activo
  ids: [],                // array de ids (strings) seleccionados
  // eslint-disable-next-line no-extra-boolean-cast
  setModoSeleccion: (v) => set({ modoSeleccion: Boolean(v), ids: Boolean(v) ? useSeleccionVehiculos.getState().ids : [] }),
  toggleId: (id) => set((s) => ({ ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id] })),
  seleccionarTodos: (ids) => set({ ids: [...ids] }),
  limpiar: () => set({ ids: [] }),
  salir: () => set({ modoSeleccion: false, ids: [] }),
}))
