const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hora

let cache = null // { rate, fetchedAt }

/** Cotización oficial del dólar (ARS por USD) del día, con caché en memoria
 *  de 1h para no golpear la API en cada carga del catálogo. Si la API falla,
 *  devuelve la última cotización cacheada (aunque esté vencida) o `null` si
 *  todavía no se consiguió ninguna — quien llama debe manejar ese caso (por
 *  ejemplo, no convertir y ordenar solo dentro de cada moneda). */
export async function obtenerCotizacionUsd({ fetchImpl = fetch } = {}) {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.rate
  try {
    const res = await fetchImpl('https://dolarapi.com/v1/dolares/oficial', { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`dolarapi respondió ${res.status}`)
    const data = await res.json()
    const rate = Number(data.venta)
    if (!rate || !Number.isFinite(rate)) throw new Error('cotización inválida')
    cache = { rate, fetchedAt: Date.now() }
    return rate
  } catch (err) {
    console.error('[exchangeRate] no se pudo obtener la cotización del dólar', err)
    return cache?.rate ?? null
  }
}
