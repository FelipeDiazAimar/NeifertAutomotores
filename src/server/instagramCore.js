/**
 * Orquestación de la sync de Instagram: usa el scraping puro de
 * instagramScraper.js y lo sube a nuestro storage real (R2 + Supabase).
 * Sin dependencias de Vite ni Vercel, para poder llamarse desde
 * scripts/syncInstagram.mjs y desde funciones serverless de producción
 * (api/instagram/*.js).
 *
 * runInstagramSync(...) → trae posteos nuevos + los sube a R2 + Supabase
 *   (usada por scripts/syncInstagram.mjs — corre LOCAL, nunca en Vercel:
 *   Instagram bloquea el scraping desde IPs de datacenter).
 * mergeAndSaveInstagramItems(...) → guarda posteos ya subidos a R2 (usada
 *   también por api/instagram/report-sync.js, que recibe lo que encuentra
 *   el agente/ejecutable de un empleado corriendo en su compu).
 */

import { createClient } from '@supabase/supabase-js'
import { createR2Client, putR2Object } from './r2Core.js'
import { fetchInstagramPage } from './instagramScraper.js'

export { fetchInstagramPage }

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

function extFromContentType(ct) {
  if (ct?.includes('video')) return 'mp4'
  if (ct?.includes('png')) return 'png'
  return 'jpg'
}

/** Descarga el media de un post de Instagram (imagen o video). */
async function downloadPostMedia(post) {
  const res = await fetch(post.thumb, {
    headers: { 'User-Agent': UA, Referer: 'https://www.instagram.com/' },
  })
  if (!res.ok) throw new Error(`descarga falló (${res.status})`)
  const contentType = res.headers.get('content-type') || 'image/jpeg'
  const buffer = Buffer.from(await res.arrayBuffer())
  return { buffer, contentType }
}

/** Trae posteos nuevos de Instagram, sube su media a R2 y actualiza
 *  `contenido_sitio` (clave 'instagram') en Supabase. Devuelve
 *  { added, message }. `onProgress` es opcional, para loguear paso a paso. */
export async function runInstagramSync({
  supabaseUrl,
  supabaseServiceRoleKey,
  r2AccessKeyId,
  r2SecretAccessKey,
  r2Bucket,
  r2Endpoint,
  r2PublicUrl,
  fullSync = false,
  maxPages = 12,
  onProgress = () => {},
}) {
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const r2 = createR2Client({ accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey, endpoint: r2Endpoint })

  onProgress('Leyendo contenido actual de Supabase…')
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
  onProgress(`Ya hay ${current.items.length} posteos guardados.`)
  onProgress(fullSync ? 'Modo: carga completa (--all)' : 'Modo: solo lo nuevo')

  const newItems = []
  let cursor = null
  let caughtUp = false

  for (let page = 0; page < maxPages && !caughtUp; page++) {
    onProgress(`Trayendo página ${page + 1}…`)
    const { posts, nextCursor, hasMore } = await fetchInstagramPage(cursor)

    for (const post of posts) {
      const id = `ig-${post.id}`
      if (existingIds.has(id)) {
        if (fullSync) continue // ya lo tenemos, pero seguimos revisando el resto
        caughtUp = true
        break // modo incremental: en cuanto encontramos uno conocido, ya estamos al día
      }
      if (!post.thumb) continue // sin imagen de portada, no hay nada que subir

      try {
        const { buffer, contentType } = await downloadPostMedia(post)
        const filename = `historias/instagram/${post.id}.${extFromContentType(contentType)}`
        await putR2Object(r2, { bucket: r2Bucket, filename, body: buffer, contentType })
        const url = `${r2PublicUrl.replace(/\/$/, '')}/${filename}`

        newItems.push({
          id,
          type: post.type === 'video' ? 'video' : 'image',
          url,
          caption: post.caption || '',
          link: post.url,
        })
        onProgress(`  ✓ ${post.code} subido a R2`)
      } catch (e) {
        onProgress(`  ✗ ${post.code} falló: ${e.message}`)
      }
    }

    if (!hasMore || !nextCursor) break
    cursor = nextCursor
  }

  return mergeAndSaveInstagramItems({ supabaseUrl, supabaseServiceRoleKey, newItems })
}

/** Mezcla `newItems` con lo ya guardado en `contenido_sitio` (clave
 *  'instagram'), reordena todo por id de Instagram (pk numérico, crece con
 *  el tiempo — así se autocorrige cualquier desorden histórico sin depender
 *  de una fecha guardada) y guarda. Vuelve a chequear contra lo guardado
 *  ANTES de escribir (no confía en que el llamador ya haya deduplicado) —
 *  la usan tanto runInstagramSync (sync local) como el endpoint de
 *  producción que recibe lo que encontró el agente/ejecutable de un
 *  empleado. Devuelve { added, message }. */
export async function mergeAndSaveInstagramItems({ supabaseUrl, supabaseServiceRoleKey, newItems = [] }) {
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

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
  const trulyNew = newItems.filter((it) => it?.id && it?.url && !existingIds.has(it.id))

  const merged = [...trulyNew, ...current.items]
  const sorted = sortByInstagramIdDesc(merged)
  const orderChanged = trulyNew.length > 0 || sorted.some((it, i) => it.id !== merged[i]?.id)

  if (!orderChanged) {
    return { added: 0, message: 'No hay posteos nuevos. Todo al día.' }
  }

  const updated = { ...current, items: sorted }
  const { error: saveErr } = await supabase
    .from('contenido_sitio')
    .upsert({ clave: 'instagram', valor: updated }, { onConflict: 'clave' })
  if (saveErr) throw saveErr

  return {
    added: trulyNew.length,
    message: trulyNew.length
      ? `${trulyNew.length} posteo(s) nuevo(s) sincronizado(s).`
      : 'No había posteos nuevos, pero se corrigió el orden de los existentes.',
  }
}

/** pk numérico de un item guardado (id = "ig-<pk>"). */
function instagramPk(item) {
  try {
    return BigInt(String(item.id).replace(/^ig-/, ''))
  } catch {
    return 0n
  }
}

function sortByInstagramIdDesc(items) {
  return [...items].sort((a, b) => {
    const pa = instagramPk(a)
    const pb = instagramPk(b)
    return pa > pb ? -1 : pa < pb ? 1 : 0
  })
}
