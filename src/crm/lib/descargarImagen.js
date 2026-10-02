import { toast } from 'sonner'

/** Descarga una imagen (aunque sea de otro origen, como el CDN de R2) trayendo
 *  el blob primero — el atributo `download` de un <a> no alcanza con URLs
 *  cross-origin. */
export async function descargarImagen(url, nombre) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = nombre
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    toast.error('No se pudo descargar la imagen.')
  }
}
