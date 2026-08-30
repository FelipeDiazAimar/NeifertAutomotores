import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useUiStore } from '@/store/useUiStore'

const STORAGE_KEY = 'nf-nav-hint-dismissed'
const AUTO_HIDE_MS = 10_000

const wasDismissed = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const markDismissed = () => {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* modo privado / storage bloqueado: se re-muestra la próxima visita */
  }
}

/** Globo de conversación que aparece solo en el home y en mobile, apuntando
 *  al botón de hamburguesa para invitar a abrir el menú. Se descarta al abrir
 *  el menú, al tocar la X, o solo tras 10s — y no vuelve a aparecer (queda
 *  marcado en localStorage). */
export default function NavHintBubble() {
  const isHome = useLocation().pathname === '/'
  const [dismissed, setDismissed] = useState(wasDismissed)

  const dismiss = () => {
    markDismissed()
    setDismissed(true)
  }

  // Auto-ocultar tras unos segundos (el setState vive en el callback del timer).
  useEffect(() => {
    if (!isHome || dismissed) return undefined
    const t = setTimeout(dismiss, AUTO_HIDE_MS)
    return () => clearTimeout(t)
  }, [isHome, dismissed])

  // Abrir el menú cuenta como "ya lo vio": lo damos por descartado.
  useEffect(() => {
    return useUiStore.subscribe((state, prev) => {
      if (state.mobileNavOpen && !prev.mobileNavOpen) dismiss()
    })
  }, [])

  return (
    <AnimatePresence>
      {isHome && !dismissed && (
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.9 }}
          animate={{ opacity: 1, y: [0, -4, 0], scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.9 }}
          transition={{
            opacity: { duration: 0.25 },
            scale: { duration: 0.25 },
            y: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
          }}
          className="absolute right-5 top-full z-40 mt-2 md:hidden"
        >
          {/* Pico apuntando hacia arriba, al botón de hamburguesa */}
          <span className="absolute -top-1.5 right-4 h-3 w-3 rotate-45 rounded-[3px] border-l border-t border-neifert/30 bg-neifert" />
          <div className="flex items-center gap-2 rounded-2xl border border-neifert/30 bg-neifert px-3.5 py-2 text-sm font-semibold text-white shadow-glow-red">
            <span>¡Tocá acá para ver más!</span>
            <button
              onClick={dismiss}
              aria-label="Entendido"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
