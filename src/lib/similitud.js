// Búsqueda tolerante a errores de escritura ("toyta" ≈ "toyota").

/** Minúsculas, sin tildes y sin símbolos raros (deja letras, números y espacios). */
export function normTexto(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Distancia de edición (inserciones, borrados, cambios y letras cruzadas). */
export function distancia(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[a.length][b.length]
}

/** Errores tolerados según el largo: palabras cortas casi exactas. */
const tolerancia = (largo) => (largo <= 3 ? 0 : largo <= 6 ? 1 : 2)

/** ¿Dos palabras (ya normalizadas) son "la misma" con un error de tipeo? */
export function parecidas(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  return distancia(a, b) <= tolerancia(Math.max(a.length, b.length))
}

/** ¿El término buscado coincide con esta palabra? Sirve escribirla a medias
 *  ("coro" → "corolla"), completa o con un error de tipeo ("corola"). */
export function coincidePalabra(termino, palabra) {
  if (!termino || !palabra) return false
  if (termino.length >= 3 && palabra.startsWith(termino)) return true
  if (palabra.length >= 3 && termino.startsWith(palabra)) return true
  return parecidas(termino, palabra)
}
