/** Filtro/orden de vehículos en cliente (reutilizado por el panel admin).
 *  Misma semántica que el modo demo de vehicles.service.js. */

export const EMPTY_FILTERS = {
  fuels: [],
  transmissions: [],
  yearMin: null,
  yearMax: null,
  kmMin: null,
  kmMax: null,
}

const SORT_MAP = {
  'price-desc': ['price_usd', false],
  'price-asc': ['price_usd', true],
  'year-desc': ['year', false],
  'km-asc': ['km', true],
}

export function countActiveFilters(f) {
  if (!f) return 0
  return (
    f.fuels.length +
    f.transmissions.length +
    (f.yearMin != null ? 1 : 0) +
    (f.yearMax != null ? 1 : 0) +
    (f.kmMin != null ? 1 : 0) +
    (f.kmMax != null ? 1 : 0)
  )
}

export function filterAndSortVehicles(list, { search = '', sort = 'price-desc', filters } = {}) {
  let out = [...list]

  if (search) {
    const q = search.toLowerCase()
    out = out.filter(
      (v) =>
        v.brand?.toLowerCase().includes(q) ||
        v.model?.toLowerCase().includes(q) ||
        String(v.year).includes(q)
    )
  }

  if (filters) {
    const { fuels, transmissions, yearMin, yearMax, kmMin, kmMax } = filters
    out = out.filter((v) => {
      if (fuels?.length && !fuels.includes(v.fuel_type)) return false
      if (transmissions?.length && !transmissions.includes(v.transmission)) return false
      if (yearMin != null && v.year < yearMin) return false
      if (yearMax != null && v.year > yearMax) return false
      if (kmMin != null && v.km < kmMin) return false
      if (kmMax != null && v.km > kmMax) return false
      return true
    })
  }

  const [col, asc] = SORT_MAP[sort] || SORT_MAP['price-desc']
  out.sort((a, b) => (asc ? a[col] - b[col] : b[col] - a[col]))
  return out
}
