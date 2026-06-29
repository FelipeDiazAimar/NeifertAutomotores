import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

export default function Modal({ open, onClose, title, children }) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            className="glass relative z-10 w-full max-w-lg rounded-[20px] p-6 shadow-glass"
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
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
