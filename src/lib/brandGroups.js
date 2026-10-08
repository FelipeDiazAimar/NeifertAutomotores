/** Sort que agrupa por marca; cualquier otro mantiene el orden pedido. */
export const AGRUPA_SOLO = 'brand-asc'

/** Solo 'brand-asc' agrupa visualmente por marca. */
export function shouldGroupByBrand(sort) {
  return sort === AGRUPA_SOLO
}

/** Normaliza el nombre de marca para agrupar (vacía → "Sin marca"). */
export function brandKeyOf(vehicle) {
  const brand = String(vehicle?.brand ?? '').trim()
  return brand || 'Sin marca'
}

/** Agrupa vehículos por marca. Los grupos van A-Z (es, insensible a
 *  mayúsculas/acentos); dentro de cada grupo se conserva el orden de
 *  llegada (que ya trae el sort activo del servicio). */
export function groupVehiclesByBrand(vehicles) {
  const map = new Map()
  for (const v of vehicles) {
    const key = brandKeyOf(v)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(v)
  }
  return [...map.entries()].sort(([a], [b]) =>
    a.localeCompare(b, 'es', { sensitivity: 'base' })
  )
}

/** Parte los grupos en páginas sin cortar marcas: cada página acumula
 *  marcas enteras hasta `maxVehiculos` (una marca grande puede superarlo
 *  sola, pero nunca se parte a la mitad). */
export function paginarPorMarcas(groups, maxVehiculos = 20) {
  const paginas = []
  let actual = []
  let total = 0
  for (const entry of groups) {
    const [, items] = entry
    if (actual.length > 0 && total + items.length > maxVehiculos) {
      paginas.push(actual)
      actual = []
      total = 0
    }
    actual.push(entry)
    total += items.length
  }
  if (actual.length > 0) paginas.push(actual)
  return paginas
}
