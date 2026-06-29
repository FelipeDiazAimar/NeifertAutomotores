import { IG_POSTS } from '@/lib/igPosts'

/**
 * Busca una página de posts desde el proxy del servidor Vite.
 * Responde: { posts, nextCursor, hasMore }
 *
 * pageParam = null → primera página
 * pageParam = cursor string → página siguiente
 *
 * Fallback: si el proxy no responde (producción u otro error),
 * la primera página retorna los datos estáticos del HAR.
 */
export async function fetchInstagramPage({ pageParam = null } = {}) {
  try {
    const url = pageParam
      ? `/api/instagram-proxy?after=${encodeURIComponent(pageParam)}`
      : '/api/instagram-proxy'

    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    if (data.error) throw new Error(data.error)

    // Respuesta válida del proxy: { posts, nextCursor, hasMore }
    if (Array.isArray(data.posts)) return data

    throw new Error('Respuesta inesperada del proxy')
  } catch {
    // Proxy no disponible (producción) o error: devolver datos estáticos solo en primera página
    if (!pageParam) {
      return { posts: IG_POSTS, nextCursor: null, hasMore: false }
    }
    return { posts: [], nextCursor: null, hasMore: false }
  }
}
