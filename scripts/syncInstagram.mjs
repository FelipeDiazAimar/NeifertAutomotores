/**
 * Sincroniza el feed de Instagram: trae los posteos reales del perfil,
 * descarga la imagen/video de cada uno y lo sube a NUESTRO storage
 * (Cloudflare R2) — así la web nunca depende de las URLs de Instagram
 * (que expiran/dan 403) ni de que Instagram nos deje scrapear en vivo
 * desde Vercel (bloquea las IPs de datacenter; desde una compu normal
 * funciona bien, por eso este script se corre local, no en el servidor).
 *
 * Uso:
 *   npm run sync:instagram                    (trae solo posteos nuevos; para en
 *                                               cuanto encuentra uno ya guardado)
 *   npm run sync:instagram -- --all           (carga completa: recorre todo el
 *                                               historial, sin parar en lo ya
 *                                               guardado — usar la primera vez
 *                                               o si falta traer posteos viejos)
 *   npm run sync:instagram -- --all --pages=20 (limita/ajusta cuántas páginas
 *                                               de 24 recorre; default 12 ≈ 288
 *                                               posteos, alcanza para el perfil
 *                                               actual de ~284)
 *
 * Necesita en .env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT,
 * R2_PUBLIC_URL (los mismos que ya usa la app).
 */

import { createClient } from '@supabase/supabase-js'
import { fetchInstagramPage } from '../src/server/instagramCore.js'
import { createR2Client, putR2Object } from '../src/server/r2Core.js'

const MAX_PAGES = Number(process.argv.find((a) => a.startsWith('--pages='))?.split('=')[1]) || 12
const FULL_SYNC = process.argv.includes('--all') || process.argv.includes('--full')

const {
  VITE_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_ENDPOINT,
  R2_PUBLIC_URL,
} = process.env

function requireEnv() {
  const missing = [
    ['VITE_SUPABASE_URL', VITE_SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
    ['R2_ACCESS_KEY_ID', R2_ACCESS_KEY_ID],
    ['R2_SECRET_ACCESS_KEY', R2_SECRET_ACCESS_KEY],
    ['R2_BUCKET_NAME', R2_BUCKET_NAME],
    ['R2_ENDPOINT', R2_ENDPOINT],
    ['R2_PUBLIC_URL', R2_PUBLIC_URL],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length) {
    console.error('Faltan estas variables en .env:', missing.join(', '))
    process.exit(1)
  }
}

function extFromContentType(ct) {
  if (ct?.includes('video')) return 'mp4'
  if (ct?.includes('png')) return 'png'
  return 'jpg'
}

/** Descarga el media de un post de Instagram (imagen o video). */
async function downloadPostMedia(post) {
  const res = await fetch(post.thumb, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      Referer: 'https://www.instagram.com/',
    },
  })
  if (!res.ok) throw new Error(`descarga falló (${res.status})`)
  const contentType = res.headers.get('content-type') || 'image/jpeg'
  const buffer = Buffer.from(await res.arrayBuffer())
  return { buffer, contentType }
}

async function main() {
  requireEnv()

  const supabase = createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const r2 = createR2Client({
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    endpoint: R2_ENDPOINT,
  })

  console.log('Leyendo contenido actual de Supabase…')
  const { data: row, error: readErr } = await supabase
    .from('contenido_sitio')
    .select('valor')
    .eq('clave', 'instagram')
    .maybeSingle()
  if (readErr) throw readErr

  const current = row?.valor || {
    headline: 'Seguinos en Instagram',
    subtitle: 'Las últimas entregas, novedades y detrás de escena del salón.',
    items: [],
  }
  const existingIds = new Set(current.items.map((it) => it.id))
  console.log(`Ya hay ${current.items.length} posteos guardados.`)
  console.log(FULL_SYNC ? 'Modo: carga completa (--all)' : 'Modo: solo lo nuevo')

  const newItems = []
  let cursor = null
  let caughtUp = false

  for (let page = 0; page < MAX_PAGES && !caughtUp; page++) {
    console.log(`Trayendo página ${page + 1}…`)
    const { posts, nextCursor, hasMore } = await fetchInstagramPage(cursor)

    for (const post of posts) {
      const id = `ig-${post.id}`
      if (existingIds.has(id)) {
        if (FULL_SYNC) continue // ya lo tenemos, pero seguimos revisando el resto
        caughtUp = true
        break // modo incremental: en cuanto encontramos uno conocido, ya estamos al día
      }
      if (!post.thumb) continue // sin imagen de portada, no hay nada que subir

      try {
        const { buffer, contentType } = await downloadPostMedia(post)
        const filename = `historias/instagram/${post.id}.${extFromContentType(contentType)}`
        await putR2Object(r2, { bucket: R2_BUCKET_NAME, filename, body: buffer, contentType })
        const url = `${R2_PUBLIC_URL.replace(/\/$/, '')}/${filename}`

        newItems.push({
          id,
          type: post.type === 'video' ? 'video' : 'image',
          url,
          caption: post.caption || '',
          link: post.url,
        })
        console.log(`  ✓ ${post.code} subido a R2`)
      } catch (e) {
        console.warn(`  ✗ ${post.code} falló: ${e.message}`)
      }
    }

    if (!hasMore || !nextCursor) break
    cursor = nextCursor
  }

  if (!newItems.length) {
    console.log('No hay posteos nuevos. Todo al día.')
    return
  }

  const updated = { ...current, items: [...newItems, ...current.items] }
  const { error: saveErr } = await supabase
    .from('contenido_sitio')
    .upsert({ clave: 'instagram', valor: updated }, { onConflict: 'clave' })
  if (saveErr) throw saveErr

  console.log(`\nListo: ${newItems.length} posteo(s) nuevo(s) sincronizado(s) a R2 + Supabase.`)
}

main().catch((e) => {
  console.error('Error:', e.message)
  process.exit(1)
})
