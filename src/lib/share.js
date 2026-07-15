import { toast } from 'sonner'

/** Comparte una URL usando el panel nativo del dispositivo (Web Share API) y,
 *  si no está disponible, copia el link al portapapeles y avisa. En mobile abre
 *  el panel del sistema; en desktop lo abre donde exista (Edge/Safari/Chrome
 *  recientes) o cae al copiado. */
export async function shareOrCopy({ url, title = 'Neifert Automotores', text = '' }) {
  const absolute = url.startsWith('http') ? url : `${window.location.origin}${url}`

  if (navigator.share) {
    try {
      await navigator.share({ title, text, url: absolute })
      return 'shared'
    } catch (err) {
      // El usuario canceló el panel: no hacemos nada.
      if (err?.name === 'AbortError') return 'cancelled'
      // Cualquier otro error → caemos al copiado.
    }
  }

  try {
    await navigator.clipboard.writeText(absolute)
    toast.success('Link copiado al portapapeles')
    return 'copied'
  } catch {
    // Fallback ultra-defensivo (navegadores viejos / contextos no seguros)
    const ta = document.createElement('textarea')
    ta.value = absolute
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
      toast.success('Link copiado al portapapeles')
      return 'copied'
    } catch {
      toast.error('No se pudo copiar el link')
      return 'error'
    } finally {
      document.body.removeChild(ta)
    }
  }
}
