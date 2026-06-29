import { create } from 'zustand'

/** Estado de cliente del CRM: filtro rápido activo, tab mobile y búsqueda. */
export const useCrmStore = create((set) => ({
  quickFilter: 'todos', // 'todos' | 'nuevos' | 'seguimiento' | 'finalizados'
  mobileTab: 'leads', // 'registrar' | 'leads'
  search: '',

  setQuickFilter: (quickFilter) => set({ quickFilter }),
  setMobileTab: (mobileTab) => set({ mobileTab }),
  setSearch: (search) => set({ search }),
}))
