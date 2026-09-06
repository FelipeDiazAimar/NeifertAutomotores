import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLenis } from 'lenis/react'
import { X } from 'lucide-react'
import { useClienteMutations } from '@/crm/hooks/useClientes'
import ClienteForm from '@/crm/components/ClienteForm'

/** Alta de cliente como overlay (mismo patrón que VehiculoFormModal). */
export default function ClienteFormModal({ open, onClose, onCreado }) {
  const { crear } = useClienteMutations()
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
              <ClienteForm
                guardando={crear.isPending}
                onGuardar={(data) =>
                  crear.mutate(data, {
                    onSuccess: (fila) => {
                      onClose()
                      onCreado?.(fila)
                    },
                  })
                }
              />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
