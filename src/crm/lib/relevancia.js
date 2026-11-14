// Lógica pura del tablero de relevancias (/crm/relevancias): dos columnas de
// ids — `ranked` (ranking, el primero es el #1) y `sin` (sin relevancia) —,
// movimientos entre ellas y qué posiciones hay que guardar.

export const COL_RANKED = 'ranked'
export const COL_SIN = 'sin'

const porAnioDesc = (a, b) =>
  (b.anio ?? 0) - (a.anio ?? 0) || String(a.marca ?? '').localeCompare(String(b.marca ?? ''), 'es')

/** Reparte los vehículos en el ranking (por su posición) y los que aún no
 *  tienen relevancia (año desc). Devuelve solo ids. */
export function dividirPorRelevancia(vehiculos) {
  const con = vehiculos
    .filter((v) => v.orden_relevancia != null)
    .sort((a, b) => a.orden_relevancia - b.orden_relevancia || String(a.id).localeCompare(String(b.id)))
  const sin = vehiculos.filter((v) => v.orden_relevancia == null).sort(porAnioDesc)
  return { [COL_RANKED]: con.map((v) => v.id), [COL_SIN]: sin.map((v) => v.id) }
}

/** Columna en la que está `id`; si `id` es el nombre de una columna, esa. */
export function columnaDe(cols, id) {
  if (id === COL_RANKED || id === COL_SIN) return id
  if (cols[COL_RANKED].includes(id)) return COL_RANKED
  if (cols[COL_SIN].includes(id)) return COL_SIN
  return null
}

/** Mientras se arrastra: si `activo` pasó sobre otra columna, lo mueve ahí
 *  (justo en el lugar de `sobre`, o al final si `sobre` es la columna). */
export function moverEntreColumnas(cols, activo, sobre) {
  const origen = columnaDe(cols, activo)
  const destino = columnaDe(cols, sobre)
  if (!origen || !destino || origen === destino) return cols
  const sinActivo = cols[destino].filter((id) => id !== activo)
  const idx = sinActivo.indexOf(sobre)
  const posicion = idx >= 0 ? idx : sinActivo.length
  return {
    ...cols,
    [origen]: cols[origen].filter((id) => id !== activo),
    [destino]: [...sinActivo.slice(0, posicion), activo, ...sinActivo.slice(posicion)],
  }
}

/** Al soltar dentro de la misma columna: reordena `activo` en el lugar de `sobre`. */
export function reordenarEnColumna(cols, activo, sobre) {
  const col = columnaDe(cols, activo)
  if (!col || col !== columnaDe(cols, sobre) || activo === sobre || sobre === col) return cols
  const lista = [...cols[col]]
  const desde = lista.indexOf(activo)
  const hasta = lista.indexOf(sobre)
  lista.splice(desde, 1)
  lista.splice(hasta, 0, activo)
  return { ...cols, [col]: lista }
}

/** Posiciones a guardar: ranking → 1..n, sin relevancia → null. Solo las que
 *  difieren de `actuales` (Map/obj id → orden_relevancia o null). */
export function cambiosDeRelevancia(actuales, cols) {
  const get = (id) => (actuales instanceof Map ? actuales.get(id) : actuales[id]) ?? null
  const cambios = []
  cols[COL_RANKED].forEach((id, i) => {
    if (get(id) !== i + 1) cambios.push({ id, orden_relevancia: i + 1 })
  })
  for (const id of cols[COL_SIN]) {
    if (get(id) !== null) cambios.push({ id, orden_relevancia: null })
  }
  return cambios
}

const sinTildes = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** ¿El vehículo coincide con el texto buscado? Cada palabra tiene que estar en
 *  marca, modelo, versión, año, color, patente o dueño (sin tildes ni
 *  mayúsculas). Texto vacío = coincide todo. */
export function coincideBusqueda(v, texto) {
  const palabras = sinTildes(texto).split(/\s+/).filter(Boolean)
  if (!palabras.length) return true
  const pajar = sinTildes(
    [v.marca, v.modelo, v.version, v.anio, v.color, v.patente, v.duenio_nombre, v.duenio_apellido].join(' '),
  )
  return palabras.every((p) => pajar.includes(p))
}
