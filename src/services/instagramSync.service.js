/** Dispara la sincronización real del feed de Instagram (modo incremental).
 *  Solo funciona corriendo `npm run dev` local — no hay endpoint de
 *  producción a propósito, Instagram bloquea el scraping desde IPs de
 *  datacenter como las de Vercel. */
export async function syncInstagramFeed() {
  const res = await fetch('/api/instagram/sync', { method: 'POST' })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || 'No se pudo sincronizar Instagram.')
  return json
}
