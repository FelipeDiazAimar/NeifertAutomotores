import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLenis } from 'lenis/react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

const ANCHOS = {
  sm: 'max-w-lg',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
}

/** Overlay centrado con scroll propio. La página usa smooth-scroll de Lenis
 *  (<ReactLenis root>): maneja el scroll por JS, ignora `overflow: hidden` y
 *  captura la rueda sobre el modal — hay que frenarlo mientras está abierto y
 *  marcar el overlay con `data-lenis-prevent` para que la rueda scrollee el
 *  contenido del modal y no la página. */
export default function Modal({ open, onClose, title, size = 'sm', children }) {
  const lenis = useLenis()

  useEffect(() => {
    if (!open) return
    lenis?.stop()

    const { documentElement: html, body } = document
    const anchoScrollbar = window.innerWidth - html.clientWidth
    const previo = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
    }
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    if (anchoScrollbar > 0) body.style.paddingRight = `${anchoScrollbar}px`

    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
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
          className="fixed inset-0 z-50 overflow-y-auto overscroll-contain"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
          <div className="relative flex min-h-full items-start justify-center p-4">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className={cn(
                'glass relative z-10 my-4 w-full rounded-[20px] p-6 shadow-glass',
                ANCHOS[size] ?? ANCHOS.sm,
              )}
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-ink">{title}</h3>
                <button
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface hover:text-ink"
                >
                  <X size={18} />
                </button>
              </div>
              {children}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
