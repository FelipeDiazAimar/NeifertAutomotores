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

/** Capa única de subida de media. Hoy:
 *   - MODO DEMO (sin Supabase): imágenes → dataURL WebP comprimido (persiste en
 *     localStorage); videos → object URL efímero (solo esta sesión) para probar.
 *   - Supabase: sube al bucket y devuelve URL pública.
 *  Cuando se conecte Cloudflare R2, solo cambia la rama de subida real. */

const uid = () => Math.random().toString(36).slice(2, 10)

function extFor(file) {
  const map = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  }
  return map[file.type] || 'mp4'
}

/** Sube una imagen. Devuelve { url, path?, width, height, ratio, warning, demo }. */
export async function uploadImageMedia(file, { bucket = 'vehicles', onProgress } = {}) {
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
  onProgress?.(0.7)

  if (!isSupabaseConfigured) {
    onProgress?.(1)
    return { url: dataUrl, width: cw, height: ch, ratio: ratio.id, warning, demo: true }
  }

  const blob = await (await fetch(dataUrl)).blob()
  const path = `${Date.now()}-${uid()}.webp`
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { cacheControl: '3600', contentType: 'image/webp', upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  onProgress?.(1)
  return { url: data.publicUrl, path, width: cw, height: ch, ratio: ratio.id, warning }
}

/** Sube un video. Devuelve { url, path?, width, height, duration, ratio, warning, demo, persistent }. */
export async function uploadVideoMedia(file, { bucket = 'stories', onProgress } = {}) {
  const err = validateVideoFile(file)
  if (err) throw new Error(err)

  onProgress?.(0.15)
  const meta = await readVideoMeta(file)
  const { ratio, off } = closestRatio(meta.width, meta.height, VIDEO_RATIOS)
  const ratioWarn =
    off > RATIO_TOLERANCE
      ? `Video ${(meta.width / meta.height).toFixed(2)}:1 — se recomienda ${ratio.id} (Reel). `
      : ''

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

  onProgress?.(0.3)
  const path = `${Date.now()}-${uid()}.${extFor(file)}`
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
