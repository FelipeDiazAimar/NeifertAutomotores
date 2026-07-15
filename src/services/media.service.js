import { supabase, isSupabaseConfigured } from './supabaseClient'
import {
  validateImageFile,
  validateVideoFile,
  readImageSize,
  readVideoMeta,
  compressImage,
  closestRatio,
  formatDuration,
  IMAGE_RATIOS,
  VIDEO_RATIOS,
  RATIO_TOLERANCE,
  toMb,
} from '@/lib/mediaFormats'

/** Capa única de subida de media, en cascada:
 *   1) Cloudflare R2 (si está configurado en el servidor) — storage real,
 *      10GB gratis, sin límite artificial de tamaño por archivo. El archivo
 *      sube directo del navegador a R2 con una URL firmada (no pasa por
 *      nuestro servidor, así video pesado no lo satura).
 *   2) Supabase Storage (si R2 no está configurado pero Supabase sí).
 *   3) MODO DEMO (ninguno configurado): imágenes → dataURL WebP comprimido
 *      (persiste en localStorage); videos → object URL efímero de la sesión. */

const uid = () => Math.random().toString(36).slice(2, 10)

function extFor(file) {
  const map = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'image/webp': 'webp',
  }
  return map[file.type] || 'bin'
}

/** Sube un blob a R2 vía URL firmada, con progreso real (XHR: fetch no expone
 *  upload progress). Devuelve la URL pública, o null si R2 no está configurado. */
function uploadToR2(path, blob, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    fetch('/api/r2/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: path, contentType }),
    })
      .then((r) => r.json())
      .then((presign) => {
        if (!presign.ok) return resolve(null) // R2 no configurado -> fallback

        const xhr = new XMLHttpRequest()
        xhr.open('PUT', presign.uploadUrl)
        xhr.setRequestHeader('Content-Type', contentType)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress?.(e.loaded / e.total)
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(presign.publicUrl)
          else reject(new Error(`Subida a R2 falló (${xhr.status})`))
        }
        xhr.onerror = () => reject(new Error('Error de red subiendo a R2'))
        xhr.send(blob)
      })
      .catch(() => resolve(null)) // proxy inalcanzable -> fallback silencioso
  })
}

/** Sube una imagen. Devuelve { url, path?, width, height, ratio, warning, demo }. */
export async function uploadImageMedia(file, { bucket = 'vehiculos', onProgress } = {}) {
  const err = validateImageFile(file)
  if (err) throw new Error(err)

  onProgress?.(0.1)
  const { width, height } = await readImageSize(file)
  const { ratio, off } = closestRatio(width, height, IMAGE_RATIOS)
  const warning =
    off > RATIO_TOLERANCE
      ? `Imagen ${(width / height).toFixed(2)}:1 — se recomienda ${ratio.id} (estilo Instagram). Se usa igual.`
      : null

  onProgress?.(0.3)
  const { dataUrl, width: cw, height: ch } = await compressImage(file)
  const blob = await (await fetch(dataUrl)).blob()
  onProgress?.(0.5)

  const path = `${bucket}/${Date.now()}-${uid()}.webp`
  const r2Url = await uploadToR2(path, blob, 'image/webp', (p) => onProgress?.(0.5 + p * 0.5))
  if (r2Url) return { url: r2Url, path, width: cw, height: ch, ratio: ratio.id, warning }

  if (!isSupabaseConfigured) {
    onProgress?.(1)
    return { url: dataUrl, width: cw, height: ch, ratio: ratio.id, warning, demo: true }
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { cacheControl: '3600', contentType: 'image/webp', upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  onProgress?.(1)
  return { url: data.publicUrl, path, width: cw, height: ch, ratio: ratio.id, warning }
}

/** Sube un video. Devuelve { url, path?, width, height, duration, ratio, warning, demo, persistent }. */
export async function uploadVideoMedia(file, { bucket = 'historias', onProgress } = {}) {
  const err = validateVideoFile(file)
  if (err) throw new Error(err)

  onProgress?.(0.05)
  const meta = await readVideoMeta(file)
  const { ratio, off } = closestRatio(meta.width, meta.height, VIDEO_RATIOS)
  const ratioWarn =
    off > RATIO_TOLERANCE
      ? `Video ${(meta.width / meta.height).toFixed(2)}:1 — se recomienda ${ratio.id} (Reel). `
      : ''

  const path = `${bucket}/${Date.now()}-${uid()}.${extFor(file)}`
  const r2Url = await uploadToR2(path, file, file.type, (p) => onProgress?.(0.05 + p * 0.95))
  if (r2Url) {
    URL.revokeObjectURL(meta.url)
    return {
      url: r2Url,
      path,
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
      durationLabel: formatDuration(meta.duration),
      ratio: ratio.id,
      warning: ratioWarn || null,
    }
  }

  if (!isSupabaseConfigured) {
    // Demo: object URL efímero. No se persiste (el video real irá a storage).
    onProgress?.(1)
    return {
      url: meta.url,
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
      durationLabel: formatDuration(meta.duration),
      ratio: ratio.id,
      warning:
        ratioWarn +
        `Modo demo: el video (${toMb(file.size).toFixed(0)}MB) se ve solo en esta sesión; se guardará real al conectar el storage.`,
      demo: true,
      persistent: false,
    }
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  onProgress?.(1)
  URL.revokeObjectURL(meta.url)
  return {
    url: data.publicUrl,
    path,
    width: meta.width,
    height: meta.height,
    duration: meta.duration,
    durationLabel: formatDuration(meta.duration),
    ratio: ratio.id,
    warning: ratioWarn || null,
  }
}

/** Extrae { bucket, path } de una URL pública de Supabase Storage, o null si
 *  la URL no tiene esa forma (.../storage/v1/object/public/<bucket>/<path>). */
function parseSupabaseStorageUrl(url) {
  const marker = '/storage/v1/object/public/'
  const i = url.indexOf(marker)
  if (i === -1) return null
  const rest = url.slice(i + marker.length)
  const slash = rest.indexOf('/')
  if (slash === -1) return null
  return { bucket: rest.slice(0, slash), path: decodeURIComponent(rest.slice(slash + 1)) }
}

/** Borra un archivo subido (foto o video) del storage que corresponda.
 *  Ignora silenciosamente dataURL/blob de demo (no hay nada remoto que borrar)
 *  y URLs que no reconozca. Pensada para llamarse en fire-and-forget al sacar
 *  una foto o borrar un vehículo, para no dejar archivos huérfanos. */
export async function deleteMedia(url) {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return

  try {
    const res = await fetch('/api/r2/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const json = await res.json()
    if (json.ok) return
  } catch {
    // proxy inalcanzable -> seguir intentando con Supabase
  }

  if (isSupabaseConfigured) {
    const parsed = parseSupabaseStorageUrl(url)
    if (parsed) {
      const { error } = await supabase.storage.from(parsed.bucket).remove([parsed.path])
      if (error) throw error
    }
  }
}
