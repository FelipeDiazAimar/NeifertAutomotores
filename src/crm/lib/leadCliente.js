// Helpers para unificar leads (public.prospectos) y clientes (crm.clientes).

/** Últimos 10 dígitos del teléfono: compara "+54 9 3564-66-9753" con
 *  "3564669753". Vacío si no hay dígitos suficientes. */
export function normTel(tel) {
  const d = String(tel ?? '').replace(/\D/g, '')
  return d.length >= 8 ? d.slice(-10) : ''
}

/** Nombre sin tildes, mayúsculas ni espacios de más (para cruzar por nombre). */
export function normNombre(nombre) {
  return String(nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** ¿Este lead ya es alguno de estos clientes? Por teléfono; si el lead no
 *  tiene teléfono, por nombre exacto (sin eso se duplicaría en cada apertura). */
export function clienteQueCoincide(lead, clientes) {
  const tel = normTel(lead.telefono)
  if (tel) return clientes.find((c) => normTel(c.telefono) === tel) ?? null
  const nombre = normNombre(lead.nombre_completo)
  return nombre ? clientes.find((c) => normNombre(c.nombre) === nombre) ?? null : null
}

const CANAL_POR_ORIGEN = {
  whatsapp: 'whatsapp',
  instagram: 'instagram',
  web: 'web',
  showroom: 'salon',
  salon: 'salon',
  referido: 'referido',
  facebook: 'facebook',
}

/** Origen del lead ("Showroom") → canal del cliente ("salon"). */
export const canalDeOrigen = (origen) =>
  CANAL_POR_ORIGEN[String(origen ?? '').trim().toLowerCase()] ?? 'otro'

const COLS_VEHICULO = [
  'condicion', 'marca', 'modelo', 'version', 'tipo', 'anio', 'color', 'km',
  'valor', 'moneda', 'notas',
]

/** Item de vehículo del editor (o del jsonb de un lead) → fila de
 *  cliente_intereses / cliente_autos_entrega. Solo las columnas conocidas y
 *  solo las que tienen valor (así no choca con columnas que aún no existan). */
export function itemAFila(item, { conTransmision = false } = {}) {
  const cols = conTransmision ? [...COLS_VEHICULO, 'trans'] : COLS_VEHICULO
  const fila = {}
  for (const c of cols) {
    const v = item?.[c]
    if (v !== undefined && v !== null && v !== '') fila[c] = v
  }
  return fila
}
