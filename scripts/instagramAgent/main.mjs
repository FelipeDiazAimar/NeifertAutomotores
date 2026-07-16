/**
 * Agente de sincronización de Instagram — pensado para correr en la compu de
 * un empleado (empaquetado como .exe, ver scripts/instagramAgent/build.mjs).
 *
 * NO lleva ningún secreto de infraestructura: la SUPABASE_ANON_KEY es
 * pública (la misma que ya viaja en el sitio web a cualquier visitante) y el
 * AGENT_TOKEN solo protege un endpoint de guardado — si se filtra, el peor
 * caso es que alguien inyecte posteos falsos en la galería de /instagram,
 * nada más. La SUPABASE_SERVICE_ROLE_KEY y las claves de R2 NUNCA están acá:
 * viven solo en el servidor (Vercel), que es quien realmente escribe.
 *
 * Flujo: 1) lee qué posteos ya están guardados (lectura pública),
 *        2) scrapea Instagram (público, sin login) hasta encontrar uno ya
 *           conocido, 3) para cada posteo nuevo pide una URL de subida
 *           firmada a nuestra propia API y sube el archivo ahí (sin usar
 *           ninguna clave de R2), 4) reporta la lista final a la API, que
 *           es la única que tiene la clave real de Supabase para guardar.
 */

import { fetchInstagramPage } from '../../src/server/instagramScraper.js'

const API_BASE = 'https://neifert.vercel.app'
const SUPABASE_URL = 'https://ghbikkvdtxhzkyyfkisv.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoYmlra3ZkdHhoemt5eWZraXN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNzE0ODUsImV4cCI6MjA5OTY0NzQ4NX0.RFpRG6ZtLjnDkPE5t3LR3LO8zOvLSNvTTHayI7Nv-BA'
const AGENT_TOKEN = 'a0f8359f5838fc4fbdc14cf620773b2e13e17e1cd457f08d'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
const MAX_PAGES = 12

function extFromContentType(ct) {
  if (ct?.includes('video')) return 'mp4'
  if (ct?.includes('png')) return 'png'
  return 'jpg'
}

async function fetchExistingIds() {
  const url = `${SUPABASE_URL}/rest/v1/contenido_sitio?clave=eq.instagram&select=valor`
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  })
  if (!res.ok) throw new Error(`No se pudo leer el contenido actual (${res.status})`)
  const rows = await res.json()
  const items = rows[0]?.valor?.items || []
  return new Set(items.map((it) => it.id))
}

async function downloadMedia(post) {
  const res = await fetch(post.thumb, { headers: { 'User-Agent': UA, Referer: 'https://www.instagram.com/' } })
  if (!res.ok) throw new Error(`descarga falló (${res.status})`)
  const contentType = res.headers.get('content-type') || 'image/jpeg'
  const buffer = Buffer.from(await res.arrayBuffer())
  return { buffer, contentType }
}

async function uploadViaPresign(filename, buffer, contentType) {
  const presignRes = await fetch(`${API_BASE}/api/r2/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, contentType }),
  })
  const presignJson = await presignRes.json()
  if (!presignJson.ok) throw new Error(presignJson.error || 'No se pudo pedir la URL de subida.')

  const putRes = await fetch(presignJson.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: buffer,
  })
  if (!putRes.ok) throw new Error(`Subida falló (${putRes.status})`)

  return presignJson.publicUrl
}

async function reportSync(items) {
  const res = await fetch(`${API_BASE}/api/instagram/report-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-agent-token': AGENT_TOKEN },
    body: JSON.stringify({ items }),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || 'No se pudo guardar en el servidor.')
  return json
}

async function main() {
  console.log('=== Neifert Automotores — Actualizar Instagram ===\n')

  console.log('Leyendo lo que ya está guardado…')
  const existingIds = await fetchExistingIds()
  console.log(`Ya hay ${existingIds.size} posteo(s) guardado(s).\n`)

  const newItems = []
  let cursor = null
  let caughtUp = false

  for (let page = 0; page < MAX_PAGES && !caughtUp; page++) {
    console.log(`Revisando página ${page + 1}…`)
    const { posts, nextCursor, hasMore } = await fetchInstagramPage(cursor)

    for (const post of posts) {
      const id = `ig-${post.id}`
      if (existingIds.has(id)) {
        caughtUp = true
        break
      }
      if (!post.thumb) continue

      try {
        const { buffer, contentType } = await downloadMedia(post)
        const filename = `historias/instagram/${post.id}.${extFromContentType(contentType)}`
        const publicUrl = await uploadViaPresign(filename, buffer, contentType)
        newItems.push({
          id,
          type: post.type === 'video' ? 'video' : 'image',
          url: publicUrl,
          caption: post.caption || '',
          link: post.url,
        })
        console.log(`  OK ${post.code}`)
      } catch (e) {
        console.warn(`  Error en ${post.code}: ${e.message}`)
      }
    }

    if (!hasMore || !nextCursor) break
    cursor = nextCursor
  }

  if (!newItems.length) {
    console.log('\nNo hay publicaciones nuevas. Todo al día.')
    return
  }

  console.log(`\nGuardando ${newItems.length} publicación(es) nueva(s)…`)
  const result = await reportSync(newItems)
  console.log(`\n${result.message}`)
}

main()
  .catch((e) => {
    console.error('\nError:', e.message)
  })
  .finally(() => {
    console.log('\nListo. Presioná ENTER para cerrar esta ventana…')
    process.stdin.resume()
    process.stdin.once('data', () => process.exit(0))
  })
