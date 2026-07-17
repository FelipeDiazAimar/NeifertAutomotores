/** Estándar de formatos de media — alineado con Instagram para reutilizar
 *  fotos/videos del perfil. No se recorta a la fuerza: se valida y se avisa;
 *  cada superficie decide el recorte con object-fit. */

// image/heic + image/heif = fotos de iPhone (HEIC). Safari/iOS las decodifica
// nativamente en canvas, así que se comprimen a WebP como cualquier otra.
export const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
// Extensiones aceptadas por si el navegador no reporta el MIME (iOS a veces
// entrega el archivo con type vacío, sobre todo con HEIC).
export const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']
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

/** Extensión (en minúsculas) de un File, o '' si no tiene. */
export const fileExt = (file) => (file?.name?.split('.').pop() || '').toLowerCase()

/** true si el archivo es una imagen aceptada, por MIME o por extensión (para
 *  tolerar el type vacío que a veces manda iOS con fotos HEIC). */
export function isAcceptedImageFile(file) {
  if (!file) return false
  if (file.type && IMAGE_MIME.includes(file.type)) return true
  // Sin MIME confiable (o genérico) → decidir por extensión.
  if (!file.type || file.type === 'application/octet-stream')
    return IMAGE_EXT.includes(fileExt(file))
  // Cualquier otro image/* (ej. image/heic-sequence) también se acepta.
  return file.type.startsWith('image/') || IMAGE_EXT.includes(fileExt(file))
}

export function validateImageFile(file) {
  if (!isAcceptedImageFile(file))
    return `Formato no soportado (${file.type || fileExt(file) || 'desconocido'}). Usá JPG, PNG, WebP o HEIC.`
  return null
}

/** true si el archivo es HEIC/HEIF (fotos de iPhone). Ni <img> ni
 *  createImageBitmap() lo decodifican de forma confiable en todos los
 *  navegadores/contextos — hay que convertirlo a JPEG antes de tocarlo. */
export function isHeicFile(file) {
  if (!file) return false
  const type = (file.type || '').toLowerCase()
  if (type === 'image/heic' || type === 'image/heif') return true
  if (!type || type === 'application/octet-stream') {
    const ext = fileExt(file)
    return ext === 'heic' || ext === 'heif'
  }
  return false
}

/** Convierte un HEIC/HEIF a JPEG en el navegador (decodificador propio en JS,
 *  no depende del soporte nativo del navegador). Si el archivo no es HEIC,
 *  lo devuelve tal cual. */
export async function convertHeicToJpeg(file) {
  if (!isHeicFile(file)) return file
  console.log('[IMG] convertHeicToJpeg: detectado HEIC, convirtiendo…', { name: file.name, sizeMB: +(file.size / 1048576).toFixed(2) })
  const { default: heic2any } = await import('heic2any')
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
  const blob = Array.isArray(result) ? result[0] : result
  const converted = new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'imagen'}.jpg`, { type: 'image/jpeg' })
  console.log('[IMG] convertHeicToJpeg: OK', { sizeMB: +(converted.size / 1048576).toFixed(2) })
  return converted
}

export function validateVideoFile(file, maxMB = MAX_VIDEO_MB) {
  if (!VIDEO_MIME.includes(file.type)) return 'Formato no soportado. Usá MP4, WebM o MOV.'
  if (toMb(file.size) > maxMB)
    return `El video pesa ${toMb(file.size).toFixed(0)}MB. Máximo ${maxMB}MB.`
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
export async function compressImage(
  file,
  { maxEdge = IMAGE_MAX_EDGE, quality = IMAGE_QUALITY, maxBytes = MAX_IMAGE_MB * 1024 * 1024 } = {}
) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch (e) {
    console.error('[IMG] compressImage: createImageBitmap FALLÓ para', file?.type || fileExt(file), e)
    throw new Error('Este navegador no puede decodificar la imagen (formato no soportado).', { cause: e })
  }
  const originalWidth = bitmap.width
  const originalHeight = bitmap.height
  let edge = Math.min(maxEdge, Math.max(originalWidth, originalHeight))
  let output

  // Baja primero la calidad y, solo si hace falta, las dimensiones.
  for (let attempt = 0; attempt < 10; attempt++) {
    const scale = edge / Math.max(originalWidth, originalHeight)
    const width = Math.max(1, Math.round(originalWidth * scale))
    const height = Math.max(1, Math.round(originalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
    const attemptQuality = Math.max(0.5, quality - attempt * 0.05)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', attemptQuality))
    if (!blob) throw new Error('El navegador no pudo comprimir la imagen.')
    output = { blob, width, height }
    if (blob.size <= maxBytes) break
    edge = Math.round(edge * 0.82)
  }
  bitmap.close?.()
  if (!output || output.blob.size > maxBytes)
    throw new Error(`No se pudo reducir la imagen a ${MAX_IMAGE_MB}MB.`)
  return output
}

/** Recorta una imagen con un cuadro 1:1 y devuelve un archivo WebP. */
export async function cropImageToSquare(file, { x = 0.5, y = 0.5, zoom = 1 } = {}) {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height) / zoom
  const sx = Math.max(0, Math.min(bitmap.width - side, x * (bitmap.width - side)))
  const sy = Math.max(0, Math.min(bitmap.height - side, y * (bitmap.height - side)))
  const outputSide = Math.min(IMAGE_MAX_EDGE, Math.round(side))
  const canvas = document.createElement('canvas')
  canvas.width = outputSide
  canvas.height = outputSide
  canvas.getContext('2d').drawImage(bitmap, sx, sy, side, side, 0, 0, outputSide, outputSide)
  bitmap.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.94))
  if (!blob) throw new Error('El navegador no pudo recortar la imagen.')
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'imagen'}.webp`, { type: 'image/webp' })
}

/** Gira una imagen 90° en sentido horario y la conserva como WebP. */
export async function rotateImageClockwise(file) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.height
  canvas.height = bitmap.width
  const context = canvas.getContext('2d')
  context.translate(canvas.width, 0)
  context.rotate(Math.PI / 2)
  context.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.94))
  if (!blob) throw new Error('El navegador no pudo rotar la imagen.')
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'imagen'}.webp`, { type: 'image/webp' })
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

/* ---------------------------------------------------------------------------
   Home page image presets — relaciones de aspecto específicas por categoría.
   Se usan en el cropper desde /admin/contenido.
--------------------------------------------------------------------------- */

export const HOME_MAX_IMAGE_MB = 10
export const HOME_MAX_VIDEO_MB = 50

export const HOME_ASPECT_RATIOS = {
  carousel: { w: 21, h: 9, label: '21:9' },
  story: { w: 4, h: 5, label: '4:5' },
  cta: { w: 21, h: 9, label: '21:9' },
}

/** Recorta una imagen con una relación de aspecto arbitraria y devuelve un File WebP. */
export async function cropImage(file, { x = 0.5, y = 0.5, zoom = 1, aspectW = 1, aspectH = 1 } = {}) {
  const bitmap = await createImageBitmap(file)
  const imgW = bitmap.width
  const imgH = bitmap.height
  const cropRatio = aspectW / aspectH
  const imageRatio = imgW / imgH

  let sourceW, sourceH
  if (cropRatio >= imageRatio) {
    sourceW = imgW / zoom
    sourceH = sourceW / cropRatio
  } else {
    sourceH = imgH / zoom
    sourceW = sourceH * cropRatio
  }

  const sx = Math.max(0, Math.min(imgW - sourceW, x * (imgW - sourceW)))
  const sy = Math.max(0, Math.min(imgH - sourceH, y * (imgH - sourceH)))

  const outputScale = Math.min(IMAGE_MAX_EDGE / Math.max(sourceW, sourceH), 1)
  const outputW = Math.round(sourceW * outputScale)
  const outputH = Math.round(sourceH * outputScale)

  const canvas = document.createElement('canvas')
  canvas.width = outputW
  canvas.height = outputH
  canvas.getContext('2d').drawImage(bitmap, sx, sy, sourceW, sourceH, 0, 0, outputW, outputH)
  bitmap.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.94))
  if (!blob) throw new Error('El navegador no pudo recortar la imagen.')
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'imagen'}.webp`, { type: 'image/webp' })
}
