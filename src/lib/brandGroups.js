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
