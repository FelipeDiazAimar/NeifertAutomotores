// Ayudas para la dictación por voz: dónde se puede escribir y cómo insertar
// el texto dictado de forma que React (inputs controlados) lo registre.

// Tipos de <input> donde tiene sentido dictar. Se excluyen password, number,
// date, time, etc.
const TIPOS_DE_TEXTO = ['', 'text', 'search', 'tel', 'url', 'email']

/** ¿Es un campo de texto editable donde se puede dictar? */
export function esCampoDeTexto(el) {
  if (!el || el.disabled || el.readOnly) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return TIPOS_DE_TEXTO.includes(el.type)
  return false
}

/** Inserta `texto` en el cursor (o reemplazando la selección) y avisa con un
 *  evento `input` para que React/react-hook-form actualicen su valor. */
export function insertarTexto(el, texto) {
  const valor = el.value ?? ''
  let ini = valor.length
  let fin = valor.length
  try {
    // En type="email" selectionStart es null: se agrega al final.
    if (el.selectionStart != null) {
      ini = el.selectionStart
      fin = el.selectionEnd
    }
  } catch {
    // algunos tipos lanzan al leer la selección
  }
  const antes = valor.slice(0, ini)
  const despues = valor.slice(fin)
  const separador = antes && !/\s$/.test(antes) ? ' ' : ''
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype

  // El setter nativo evita que React ignore el cambio (lleva su propio rastreo del valor).
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, antes + separador + texto + despues)
  const pos = (antes + separador + texto).length
  try {
    el.setSelectionRange(pos, pos)
  } catch {
    // idem: type="email" no admite setSelectionRange
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
