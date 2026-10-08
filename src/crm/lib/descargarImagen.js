import { toast } from 'sonner'

/** Descarga una imagen (aunque sea de otro origen, como el CDN de R2) trayendo
 *  el blob primero — el atributo `download` de un <a> no alcanza con URLs
 *  cross-origin. */
export async function descargarImagen(url, nombre) {
  let status = null
  try {
    const res = await fetch(url)
    status = res?.status ?? null
    if (!res?.ok) throw new Error(`HTTP ${status}`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = nombre
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000)
    return true
  } catch (err) {
    console.error('[descargarImagen] no se pudo descargar', url, status ?? err?.message ?? err)
    try {
      window.open(url, '_blank')
    } catch {
      toast.error('No se pudo descargar la imagen.')
    }
    return false
  }
}
