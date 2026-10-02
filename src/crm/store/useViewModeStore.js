import { create } from 'zustand'

const STORAGE_KEY = 'nf-crm-view-mode'

function getInitial() {
  if (typeof window === 'undefined') return 'list'
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'card' ? 'card' : 'list'
}

/** Preferencia de vista (lista/tarjetas) compartida entre Vehículos, Peritaje
 *  y Gestoría — persiste en localStorage, recuerda la última elección del
 *  usuario en cualquiera de las tres pantallas. */
export const useViewModeStore = create((set) => ({
  viewMode: getInitial(),
  setViewMode: (viewMode) => {
    localStorage.setItem(STORAGE_KEY, viewMode)
    set({ viewMode })
  },
}))
