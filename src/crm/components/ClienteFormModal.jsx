import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLenis } from 'lenis/react'
import { X } from 'lucide-react'
import { useClienteMutations } from '@/crm/hooks/useClientes'
import { useTareaMutations } from '@/crm/hooks/useTareas'
import { useAlertaMutations } from '@/crm/hooks/useAlertas'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import ClienteForm from '@/crm/components/ClienteForm'

/** Alta de cliente como overlay (mismo patrón que VehiculoFormModal). */
export default function ClienteFormModal({ open, onClose, onCreado }) {
  const { crear } = useClienteMutations()
  const { crear: crearTarea } = useTareaMutations()
  const { crear: crearAlerta } = useAlertaMutations()
  const { id: miId } = useCrmPerfil()
  const [guardando, setGuardando] = useState(false)
  const lenis = useLenis()

  useEffect(() => {
    if (!open) return
    lenis?.stop()
    const { documentElement: html, body } = document
    const anchoScrollbar = window.innerWidth - html.clientWidth
    const previo = { htmlOverflow: html.style.overflow, bodyOverflow: body.style.overflow, bodyPaddingRight: body.style.paddingRight }
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    if (anchoScrollbar > 0) body.style.paddingRight = `${anchoScrollbar}px`
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => {
      lenis?.start()
      html.style.overflow = previo.htmlOverflow
      body.style.overflow = previo.bodyOverflow
      body.style.paddingRight = previo.bodyPaddingRight
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, lenis])

  // Alta del cliente + su tarea/alerta opcionales, ya vinculadas. Si una de
  // las dos falla el cliente ya existe: el hook muestra el error y se sigue.
  async function guardar(data) {
    const {
      tarea_titulo, tarea_fecha, tarea_hora, tarea_prioridad,
      alerta_titulo, alerta_fecha, alerta_hora, ...cliente
    } = data
    setGuardando(true)
    try {
      const fila = await crear.mutateAsync(cliente)
      if (tarea_titulo) {
        await crearTarea
          .mutateAsync({
            titulo: tarea_titulo, fecha: tarea_fecha, hora: tarea_hora || null,
            prioridad: tarea_prioridad || 'normal', asignado_a: miId, cliente_id: fila.id,
          })
          .catch(() => {})
      }
      if (alerta_titulo) {
        await crearAlerta
          .mutateAsync({
            titulo: alerta_titulo, fecha: alerta_fecha, hora: alerta_hora,
            asignado_a: miId, cliente_id: fila.id,
          })
          .catch(() => {})
      }
      onClose()
      onCreado?.(fila)
    } catch {
      // el error ya lo muestra el toast de la mutación
    } finally {
      setGuardando(false)
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          data-lenis-prevent
          className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
          <div className="relative flex min-h-full items-start justify-center p-4 sm:p-6">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Cargar cliente"
              className="glass relative z-10 my-4 w-full max-w-2xl rounded-[20px] p-6 shadow-glass"
              initial={{ scale: 0.96, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, y: 8 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-ink">Cargar cliente</h2>
                <button
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface hover:text-ink"
                >
                  <X size={18} />
                </button>
              </div>
              <ClienteForm conSeguimiento guardando={guardando} onGuardar={guardar} />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
