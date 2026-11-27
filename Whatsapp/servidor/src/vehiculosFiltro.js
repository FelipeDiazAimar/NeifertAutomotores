/*
 * Búsqueda en el catálogo para el bot (la IA la usa como herramienta). Sin dependencias: se prueba sola.
 */
const sinTildes = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
const numero = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/**
 * Busca en el catálogo lo que pide el bot (la IA lo consulta en vez de recibirlo entero en cada
 * mensaje). Filtros, todos opcionales: q (palabras sueltas, todas tienen que estar), marca, modelo,
 * anioDesde, anioHasta, kmMax, precioMax (con moneda: 'USD' o 'ARS'), combustible, transmision,
 * nuevo ('1' = solo 0 km), disponibles ('1' = sin los reservados). Devuelve { total, vehiculos }
 * con hasta `limite` (10 por defecto, 25 como máximo).
 */
export function filtrarVehiculos(lista, q = {}) {
  const palabras = sinTildes(q.q).split(/\s+/).filter(Boolean)
  const marca = sinTildes(q.marca).trim()
  const modelo = sinTildes(q.modelo).trim()
  const combustible = sinTildes(q.combustible).trim()
  const transmision = sinTildes(q.transmision).trim()
  const [desde, hasta, kmMax, precioMax] = [numero(q.anioDesde), numero(q.anioHasta), numero(q.kmMax), numero(q.precioMax)]
  const moneda = String(q.moneda || '').toUpperCase()
  const limite = Math.min(Math.max(Math.trunc(numero(q.limite) ?? 10), 1), 25)
  const sirven = lista.filter((v) => {
    const texto = sinTildes(`${v.nombre} ${v.anio} ${v.combustible} ${v.transmision}`)
    if (!palabras.every((p) => texto.includes(p))) return false
    if (marca && !sinTildes(v.marca).includes(marca)) return false
    if (modelo && !sinTildes(`${v.modelo} ${v.nombre}`).includes(modelo)) return false
    if (combustible && !sinTildes(v.combustible).includes(combustible)) return false
    if (transmision && !sinTildes(v.transmision).includes(transmision)) return false
    if (desde !== null && !(v.anio >= desde)) return false
    if (hasta !== null && !(v.anio <= hasta)) return false
    if (kmMax !== null && !((v.km || 0) <= kmMax)) return false
    if (precioMax !== null) {
      if (!v.precio) return false // sin precio cargado ("consultar"): no se puede decir que entra
      if (moneda && String(v.moneda || '').toUpperCase() !== moneda) return false
      if (v.precio > precioMax) return false
    }
    if (String(q.nuevo) === '1' && !v.nuevo) return false
    if (String(q.disponibles) === '1' && v.reservado) return false
    return true
  })
  return { total: sirven.length, vehiculos: sirven.slice(0, limite) }
}
