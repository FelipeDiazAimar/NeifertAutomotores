/** Estándar de formatos de media — alineado con Instagram para reutilizar
 *  fotos/videos del perfil. No se recorta a la fuerza: se valida y se avisa;
 *  cada superficie decide el recorte con object-fit. */

export const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp']
export const VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime']

export const MAX_IMAGE_MB = 5
// Límite real de Instagram para Reels (1GB). Con Backblaze B2 como storage no
// hay un tope artificial de archivo como en ImageKit/Cloudinary (100MB free).
export const MAX_VIDEO_MB = 1024

/** Relaciones de aspecto permitidas (w/h) con dimensiones objetivo. */
export const IMAGE_RATIOS = [
  { id: '4:5', label: 'Vertical · 4:5', value: 4 / 5, w: 1080, h: 1350 },
  { id: '1:1', label: 'Cuadrado · 1:1', value: 1, w: 1080, h: 1080 },
  { id: '1.91:1', label: 'Horizontal · 1.91:1', value: 1.91, w: 1080, h: 566 },
]
export const VIDEO_RATIOS = [
  { id: '9:16', label: 'Reel · 9:16', value: 9 / 16, w: 1080, h: 1920 },
  { id: '1:1', label: 'Cuadrado · 1:1', value: 1, w: 1080, h: 1080 },
]

/** Tolerancia de aspecto antes de sugerir recorte. */
export const RATIO_TOLERANCE = 0.08

// Compresión de imágenes: lado más largo y calidad WebP.
export const IMAGE_MAX_EDGE = 1440
export const IMAGE_QUALITY = 0.82

export const toMb = (bytes) => bytes / (1024 * 1024)

export function validateImageFile(file) {
  if (!IMAGE_MIME.includes(file.type))
    return `Formato no soportado (${file.type || 'desconocido'}). Usá JPG, PNG o WebP.`
  if (toMb(file.size) > MAX_IMAGE_MB)
    return `La imagen pesa ${toMb(file.size).toFixed(1)}MB. Máximo ${MAX_IMAGE_MB}MB.`
  return null
}

export function validateVideoFile(file) {
  if (!VIDEO_MIME.includes(file.type)) return 'Formato no soportado. Usá MP4, WebM o MOV.'
  if (toMb(file.size) > MAX_VIDEO_MB)
    return `El video pesa ${toMb(file.size).toFixed(0)}MB. Máximo ${MAX_VIDEO_MB}MB.`
  return null
}

/** Relación de aspecto más cercana de una lista → { ratio, off }. */
export function closestRatio(width, height, ratios) {
  const r = width / height
  let best = ratios[0]
  let bestOff = Infinity
  for (const cand of ratios) {
    const off = Math.abs(cand.value - r)
    if (off < bestOff) {
      bestOff = off
      best = cand
    }
  }
  return { ratio: best, off: bestOff }
}

/** Dimensiones de una imagen desde un File. */
export function readImageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

/** Comprime/redimensiona una imagen a un dataURL WebP (mantiene aspecto,
 *  limita el lado más largo a maxEdge). Reduce mucho el peso para storage. */
export async function compressImage(file, { maxEdge = IMAGE_MAX_EDGE, quality = IMAGE_QUALITY } = {}) {
  const bitmap = await createImageBitmap(file)
  let { width, height } = bitmap
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  width = Math.round(width * scale)
  height = Math.round(height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  let dataUrl = canvas.toDataURL('image/webp', quality)
  // Fallback si el navegador no soporta WebP en canvas.
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }
  return { dataUrl, width, height }
}

/** Metadata de un video (dimensiones + duración). Devuelve también la object
 *  URL creada para preview; el caller decide cuándo revocarla. */
export function readVideoMeta(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      resolve({ width: v.videoWidth, height: v.videoHeight, duration: v.duration, url })
    }
    v.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    v.src = url
  })
}

/** mm:ss desde segundos. */
export function formatDuration(seconds) {
  if (!seconds || !isFinite(seconds)) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
