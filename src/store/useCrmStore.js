import { create } from 'zustand'

/** Estado de cliente del CRM: filtro rápido activo, tab mobile, búsqueda y orden. */
export const useCrmStore = create((set) => ({
  quickFilter: 'todos', // 'todos' | 'nuevos' | 'seguimiento' | 'finalizados'
  mobileTab: 'leads', // 'registrar' | 'leads'
  search: '',
  sort: 'date-desc', // ver LEAD_SORT_OPTIONS en lib/constants.js
  originFilter: 'todos', // 'todos' | uno de LEAD_SOURCES

  setQuickFilter: (quickFilter) => set({ quickFilter }),
  setMobileTab: (mobileTab) => set({ mobileTab }),
  setSearch: (search) => set({ search }),
  setSort: (sort) => set({ sort }),
  setOriginFilter: (originFilter) => set({ originFilter }),
}))
