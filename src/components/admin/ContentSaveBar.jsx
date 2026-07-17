import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Save, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import Button from '@/components/common/Button'
import { useSiteStore } from '@/store/useSiteStore'
import { CONTENT_KEYS, saveSiteContent } from '@/services/content.service'
import { deleteMedia } from '@/services/media.service'

function snapshot(state) {
  return JSON.stringify(Object.fromEntries(CONTENT_KEYS.map((k) => [k, state[k]])))
}

/** URLs de media (imágenes/videos subidos) referenciadas por el contenido del
 *  sitio: imágenes del carrusel, imagen del CTA y video/poster de cada historia.
 *  Se usa para detectar qué archivos quedaron huérfanos al guardar y borrarlos
 *  de Cloudflare R2 (deleteMedia ignora dataURL/blob y URLs externas). */
function collectMediaUrls(state) {
  const urls = new Set()
  const add = (u) => { if (u && typeof u === 'string') urls.add(u) }
  ;(state.heroSlides || []).forEach((s) => add(s.image))
  add(state.home?.ctaImage)
  ;(state.stories || []).forEach((s) => { add(s.video_url); add(s.poster_url) })
  return urls
}

/** Barra flotante fija abajo a la derecha, centralizada para toda
 *  /admin/contenido (no por pestaña): guarda o descarta todos los cambios
 *  hechos desde que se abrió la página (o desde el último guardado). El
 *  store ya no autoguarda solo — esto es lo único que persiste a Supabase. */
export default function ContentSaveBar() {
  const baselineRef = useRef(snapshot(useSiteStore.getState()))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    return useSiteStore.subscribe((state) => {
      setDirty(snapshot(state) !== baselineRef.current)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const state = useSiteStore.getState()
      const prevState = JSON.parse(baselineRef.current)
      await Promise.all(CONTENT_KEYS.map((k) => saveSiteContent(k, state[k])))

      // Borrar de R2 la media que estaba antes y ya no se referencia (quitada
      // con la X, reemplazada, o parte de un slide/historia eliminado).
      const afterUrls = collectMediaUrls(state)
      const orphaned = [...collectMediaUrls(prevState)].filter((u) => !afterUrls.has(u))
      if (orphaned.length) {
        console.log('[content] borrando de R2 media huérfana:', orphaned)
        orphaned.forEach((u) =>
          deleteMedia(u).catch((e) => console.warn('[content] deleteMedia falló para', u, e?.message))
        )
      }

      baselineRef.current = snapshot(state)
      setDirty(false)
      toast.success('Cambios guardados')
    } catch (e) {
      toast.error('No se pudo guardar: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    useSiteStore.setState(JSON.parse(baselineRef.current))
    setDirty(false)
    toast.info('Cambios descartados')
  }

  return (
    <AnimatePresence>
      {dirty && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl border border-line bg-surface-solid p-2 shadow-2xl"
        >
          <Button variant="ghost" size="sm" icon={Undo2} onClick={discard} disabled={saving}>
            Deshacer cambios
          </Button>
          <Button size="sm" icon={Save} onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
