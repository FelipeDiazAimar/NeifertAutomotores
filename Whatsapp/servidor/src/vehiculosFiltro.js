/*
 * Búsqueda en el catálogo para el bot (la IA la usa como herramienta). Sin dependencias: se prueba sola.
 */
const sinTildes = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
/** El precio en dólares para comparar: el equivalente de la página, o el precio si ya está en USD. null si no tiene precio. */
const valorUsd = (v) => (Number(v.precioUsd) > 0 ? Number(v.precioUsd) : String(v.moneda || '').toUpperCase() === 'USD' && v.precio ? Number(v.precio) : null)
const numero = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/**
 * Busca en el catálogo lo que pide el bot (la IA lo consulta en vez de recibirlo entero en cada
 * mensaje). Filtros, todos opcionales: q (palabras sueltas, todas tienen que estar), marca, modelo,
 * anioDesde, anioHasta, kmMax, precioMax (en dólares por defecto: los de pesos se comparan con su equivalente; con moneda 'ARS', solo los publicados en pesos), combustible, transmision,
 * categoria (tipo: pickup, SUV, sedán...), condicion ('usado' o '0km'), nuevo ('1' = solo 0 km), disponibles ('1' = sin los
 * reservados), ordenar (precio_asc, precio_desc, anio_desc, anio_asc, km_asc). Devuelve { total, vehiculos }
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
  // Categoría o tipo de carrocería ("pickups", "SUV"): coincide con la categoría cargada en cualquiera de las dos direcciones
  // (el auto dice "pickup" y piden "pickups", o al revés).
  const categoria = sinTildes(q.categoria).trim()
  // Usado o 0 km: "usado", "usados", "0km", "0 km", "cero km", "nuevo".
  const condicion = sinTildes(q.condicion).split(' ').join('').split('-').join('')
  const pideNuevo = ['0km', 'cerokm', 'nuevo', 'nuevos'].includes(condicion)
  const pideUsado = ['usado', 'usados'].includes(condicion)
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
      if (moneda === 'ARS') {
        // En pesos: solo los que están publicados en pesos.
        if (String(v.moneda || '').toUpperCase() !== 'ARS' || !v.precio || v.precio > precioMax) return false
      } else {
        // En dólares (o sin decir moneda): los de pesos se comparan con su equivalente en dólares. Sin precio ("consultar"): no se puede decir que entra.
        const usd = valorUsd(v)
        if (usd === null || usd > precioMax) return false
      }
    }
    if (categoria) {
      const c = sinTildes(v.categoria).trim()
      if (!c || !(c.includes(categoria) || categoria.includes(c))) return false
    }
    const esNuevo = v.condicion ? v.condicion === '0km' : !!v.nuevo
    if ((String(q.nuevo) === '1' || pideNuevo) && !esNuevo) return false
    if (pideUsado && esNuevo) return false
    if (String(q.disponibles) === '1' && v.reservado) return false
    return true
  })
  // Para "el más barato", "el más nuevo", "el de menos kilómetros". Sin precio, al final.
  const ORDENES = {
    // Por el precio en dólares: así los de pesos y los de dólares se ordenan juntos.
    precio_asc: (a, b) => (valorUsd(a) ?? Infinity) - (valorUsd(b) ?? Infinity),
    precio_desc: (a, b) => (valorUsd(b) ?? -Infinity) - (valorUsd(a) ?? -Infinity),
    anio_desc: (a, b) => (b.anio || 0) - (a.anio || 0),
    anio_asc: (a, b) => (a.anio || 0) - (b.anio || 0),
    km_asc: (a, b) => (a.km || 0) - (b.km || 0),
  }
  const orden = ORDENES[String(q.ordenar || '')]
  const ordenados = orden ? [...sirven].sort(orden) : sirven
  return { total: ordenados.length, vehiculos: ordenados.slice(0, limite) }
}
