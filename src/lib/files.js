/** Utilidades de archivos para la subida de imágenes en modo demo.
 *  Las imágenes se guardan como dataURL (base64) para que persistan en
 *  localStorage al recargar (los object URLs se pierden). */

/** Convierte un File a dataURL (base64). */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** Convierte varios File a dataURL en paralelo. */
export function filesToDataUrls(files) {
  return Promise.all(Array.from(files).map(fileToDataUrl))
}

/** Filtra una lista de archivos dejando solo imágenes. */
export function onlyImages(files) {
  return Array.from(files).filter((f) => f.type.startsWith('image/'))
}
