/*
 * Números de teléfono. WhatsApp usa el formato internacional sin "+": en Argentina los
 * celulares van como 549 + característica + número (sin el 0 ni el 15). Pero el mismo
 * celular aparece escrito de mil formas: 54 9 3564 562413, 0 3564 15 562413, +54 3564
 * 562413… normalizarAR los lleva a una sola forma para poder compararlos.
 */

/**
 * Forma única de un número argentino: "549" + 10 dígitos (característica + número). Lo
 * que no parece argentino queda con sus dígitos tal cual. Devuelve '' si no hay número.
 *
 *   +54 9 3564 56-2413   → 5493564562413
 *   54 3564 562413       → 5493564562413   (sin el 9 de celular)
 *   0 3564 15 562413     → 5493564562413   (con 0 y 15 locales)
 *   3564 562413          → 5493564562413   (10 dígitos sueltos)
 */
export function normalizarAR(numero) {
  let d = String(numero ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('00')) d = d.slice(2) // 0054…
  let local
  if (d.startsWith('54')) {
    local = d.slice(2)
    if (local.startsWith('9')) local = local.slice(1)
  } else if (d.length === 10 || (d.length === 11 && d.startsWith('0')) || (d.length === 13 && d.startsWith('0'))) {
    local = d // número local, con o sin 0 / 15
  } else {
    return d // de otro país
  }
  if (local.startsWith('0')) local = local.slice(1)
  // 0 3564 15 562413 → 3564 15 562413: el 15 va después de la característica (2 a 4
  // dígitos). Si sacándolo quedan 10 dígitos, era el prefijo de celular.
  if (local.length === 12) {
    for (const largo of [2, 3, 4]) {
      if (local.slice(largo, largo + 2) === '15') {
        local = local.slice(0, largo) + local.slice(largo + 2)
        break
      }
    }
  }
  return local.length === 10 ? `549${local}` : d
}

/** Si dos números son el mismo teléfono (con cualquier forma de escribirlo). */
export function mismoNumero(a, b) {
  const na = normalizarAR(a)
  return na !== '' && na === normalizarAR(b)
}
