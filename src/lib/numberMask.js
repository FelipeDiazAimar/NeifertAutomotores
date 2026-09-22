const nf = new Intl.NumberFormat('es-AR')

/** Número (o '') → texto con puntos de miles ("21000000" → "21.000.000"). */
export function formatMiles(value) {
  if (value === '' || value == null || Number.isNaN(Number(value))) return ''
  return nf.format(value)
}

/** Texto con puntos (u otra cosa que tipee el usuario) → número limpio, o ''
 *  si no quedó ningún dígito. Descarta todo lo que no sea dígito, así que
 *  soporta pegar "21.000.000" o "21000000" indistinto. */
export function parseMiles(text) {
  const digits = String(text ?? '').replace(/\D/g, '')
  return digits === '' ? '' : Number(digits)
}
