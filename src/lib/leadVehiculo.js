// Datos compartidos del editor de vehículos de interés / entrega.

/** Tipos de carrocería base: se mezclan con los que ya existan en el
 *  catálogo (y con los que se creen desde el editor). */
export const TIPOS_BASE = ['Pickup', 'Sedan', 'SUV', 'Hatchback', 'Utilitario', 'Coupé', 'Familiar']

export const MONEDAS = [
  { id: 'ARS', label: '$ (ARS)' },
  { id: 'USD', label: 'US$ (USD)' },
]

/** Une listas de strings sin repetir (ignora mayúsculas) y ordena en español. */
export function unirOpciones(...listas) {
  const vistos = new Map()
  for (const lista of listas) {
    for (const v of lista ?? []) {
      const t = typeof v === 'string' ? v.trim() : ''
      if (t && !vistos.has(t.toLowerCase())) vistos.set(t.toLowerCase(), t)
    }
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
}

const nf = new Intl.NumberFormat('es-AR')

/** "$ 12.000.000" / "US$ 15.000". Vacío si no hay valor. */
export function formatValor(valor, moneda) {
  if (valor == null || valor === '' || Number(valor) <= 0) return ''
  return `${moneda === 'USD' ? 'US$' : '$'} ${nf.format(Number(valor))}`
}
