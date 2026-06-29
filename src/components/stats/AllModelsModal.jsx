import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X, MousePointerClick } from 'lucide-react'
import { useAllVehicles } from '@/hooks/useVehicles'
import { aggregateClicks } from '@/lib/vehicleClicks'

/** Modal "Ver todo": recuento de clicks/visitas por auto (todos los usuarios),
 *  filtrado por el rango de fecha activo. */
export default function AllModelsModal({ open, onClose, range }) {
  const { data: vehicles = [] } = useAllVehicles()
  const counts = open ? aggregateClicks(range || {}) : {}

  const rows = vehicles
    .map((v) => ({ v, clicks: counts[v.id] || 0 }))
    .sort((a, b) => b.clicks - a.clicks)

  const total = rows.reduce((s, r) => s + r.clicks, 0)
  const max = rows[0]?.clicks || 1

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-start justify-center overflow-y-auto p-4 py-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="glass relative z-10 w-full max-w-xl rounded-[20px] p-6 shadow-glass"
            initial={{ scale: 0.96, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 10 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-ink">Clicks por vehículo</h3>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mb-4 flex items-center gap-1.5 text-xs text-ink-3">
              <MousePointerClick size={13} />
              {total.toLocaleString('es-AR')} visitas · {range?.label || 'Todo el período'}
            </p>

            <ul className="max-h-[55vh] space-y-1 overflow-y-auto pr-1">
              {rows.map(({ v, clicks }, i) => (
                <li key={v.id} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-surface">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-neifert/10 text-xs font-bold text-neifert">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {v.brand} {v.model}
                    </p>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full bg-neifert"
                        style={{ width: `${Math.round((clicks / max) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-ink">{clicks.toLocaleString('es-AR')}</p>
                    <p className="text-[10px] uppercase tracking-wide text-ink-3">clicks</p>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
