/*
 * Tipos de archivo: extensión ↔ MIME, en un solo lugar. Lo usan el guardado de archivos
 * (qué extensión ponerle), la entrega al navegador (qué Content-Type mandar si el mensaje
 * no lo dice), el script de subida a R2 y el cálculo del espacio usado por categoría.
 */

// MIME → extensión. El primero de cada extensión es el que se usa para el camino inverso.
const LISTA = [
  // Fotos
  ['image/jpeg', 'jpg'], ['image/jpg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'], ['image/gif', 'gif'],
  ['image/heic', 'heic'], ['image/heif', 'heif'], ['image/bmp', 'bmp'], ['image/tiff', 'tif'], ['image/svg+xml', 'svg'],
  // Videos
  ['video/mp4', 'mp4'], ['video/3gpp', '3gp'], ['video/3gpp2', '3g2'], ['video/quicktime', 'mov'], ['video/webm', 'webm'],
  ['video/x-matroska', 'mkv'], ['video/x-msvideo', 'avi'], ['video/mpeg', 'mpeg'], ['video/x-m4v', 'm4v'],
  // Audios
  ['audio/ogg', 'ogg'], ['audio/opus', 'opus'], ['audio/mpeg', 'mp3'], ['audio/mp3', 'mp3'], ['audio/mp4', 'm4a'],
  ['audio/x-m4a', 'm4a'], ['audio/aac', 'aac'], ['audio/amr', 'amr'], ['audio/wav', 'wav'], ['audio/x-wav', 'wav'],
  ['audio/wave', 'wav'], ['audio/webm', 'weba'], ['audio/flac', 'flac'], ['audio/x-flac', 'flac'], ['audio/3gpp', '3ga'],
  // Documentos
  ['application/pdf', 'pdf'], ['text/plain', 'txt'], ['text/csv', 'csv'], ['application/rtf', 'rtf'],
  ['application/msword', 'doc'], ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['application/vnd.ms-excel', 'xls'], ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  ['application/vnd.ms-powerpoint', 'ppt'], ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'],
  ['application/vnd.oasis.opendocument.text', 'odt'], ['application/vnd.oasis.opendocument.spreadsheet', 'ods'],
  ['application/zip', 'zip'], ['application/x-zip-compressed', 'zip'], ['application/vnd.rar', 'rar'], ['application/x-rar-compressed', 'rar'],
  ['application/x-7z-compressed', '7z'], ['application/vnd.android.package-archive', 'apk'], ['application/json', 'json'],
  ['text/vcard', 'vcf'], ['text/x-vcard', 'vcf'], ['application/xml', 'xml'], ['text/html', 'html'],
]

const EXT_DE_MIME = new Map(LISTA)
const MIME_DE_EXT = new Map()
for (const [mime, ext] of LISTA) if (!MIME_DE_EXT.has(ext)) MIME_DE_EXT.set(ext, mime)
MIME_DE_EXT.set('jpeg', 'image/jpeg')

/** Extensión para guardar un archivo: la de su nombre si tiene, si no la de su MIME, si no "bin". */
export function extensionDe(mime = '', nombre = '') {
  const deNombre = /\.([a-z0-9]{1,5})$/i.exec(nombre || '')?.[1]
  if (deNombre) return deNombre.toLowerCase()
  const base = String(mime).split(';')[0].trim().toLowerCase()
  return EXT_DE_MIME.get(base) || base.split('/')[1]?.replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
}

/** MIME de un archivo por su extensión (para lo que se guardó sin tipo). */
export function mimeDe(nombreOClave) {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(String(nombreOClave))?.[1]?.toLowerCase()
  return (ext && MIME_DE_EXT.get(ext)) || 'application/octet-stream'
}

/** Categoría para el espacio usado: fotos, videos, audios o documentos. */
export function categoriaDe(nombreOClave) {
  const mime = mimeDe(nombreOClave)
  if (mime.startsWith('image/')) return 'fotos'
  if (mime.startsWith('video/')) return 'videos'
  if (mime.startsWith('audio/')) return 'audios'
  return 'documentos'
}
