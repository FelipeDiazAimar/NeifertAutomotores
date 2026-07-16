import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Save, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import Button from '@/components/common/Button'
import { useSiteStore } from '@/store/useSiteStore'
import { CONTENT_KEYS, saveSiteContent } from '@/services/content.service'

function snapshot(state) {
  return JSON.stringify(Object.fromEntries(CONTENT_KEYS.map((k) => [k, state[k]])))
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
      await Promise.all(CONTENT_KEYS.map((k) => saveSiteContent(k, state[k])))
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
