import { create } from 'zustand'

const EMPTY_FILTERS = {
  fuels: [], // string[]  (vehicle.fuel_type)
  transmissions: [], // string[]  (vehicle.transmission)
  yearMin: null,
  yearMax: null,
  kmMin: null,
  kmMax: null,
}

/** Estado de cliente del catálogo (filtros/orden/vista). La query de datos
 *  se deriva de estos valores en useVehicles. */
export const useCatalogStore = create((set, get) => ({
  category: 'todos',
  sort: 'price-desc',
  search: '',
  viewMode: 'grid', // 'grid' | 'list'
  filters: { ...EMPTY_FILTERS },

  setCategory: (category) => set({ category }),
  setSort: (sort) => set({ sort }),
  setSearch: (search) => set({ search }),
  setViewMode: (viewMode) => set({ viewMode }),

  setFilters: (partial) => set((s) => ({ filters: { ...s.filters, ...partial } })),
  toggleInFilter: (key, value) =>
    set((s) => {
      const arr = s.filters[key]
      const next = arr.includes(value)
        ? arr.filter((v) => v !== value)
        : [...arr, value]
      return { filters: { ...s.filters, [key]: next } }
    }),
  clearFilters: () => set({ filters: { ...EMPTY_FILTERS } }),

  /** Cantidad de filtros activos (para el badge del botón). */
  activeFilterCount: () => {
    const f = get().filters
    return (
      f.fuels.length +
      f.transmissions.length +
      (f.yearMin != null ? 1 : 0) +
      (f.yearMax != null ? 1 : 0) +
      (f.kmMin != null ? 1 : 0) +
      (f.kmMax != null ? 1 : 0)
    )
  },

  reset: () =>
    set({ category: 'todos', sort: 'price-desc', search: '', filters: { ...EMPTY_FILTERS } }),
}))
