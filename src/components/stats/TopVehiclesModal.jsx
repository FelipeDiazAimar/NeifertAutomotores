import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLenis } from 'lenis/react'
import { X, Search, Eye, MessageCircle } from 'lucide-react'

/** Modal "Ver todos": vistas/consultas por vehículo, sin límite de top-6,
 *  con buscador por marca/modelo. */
export default function TopVehiclesModal({ open, onClose, vehicles, byVehicle }) {
  const [q, setQ] = useState('')

  // Bloquea el scroll de fondo mientras el modal está abierto (Lenis maneja
  // el scroll suave global; si no se pausa, la ruedita sigue moviendo la
  // página de atrás en vez de la lista del modal).
  const lenis = useLenis()
  useEffect(() => {
    if (!lenis) return
    if (open) lenis.stop()
    else lenis.start()
    return () => lenis.start()
  }, [open, lenis])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase()
    return vehicles
      .map((v) => ({ v, stats: byVehicle[v.id] || { views: 0, conversions: 0 } }))
      .filter(({ v }) => !query || `${v.brand} ${v.model}`.toLowerCase().includes(query))
      .sort((a, b) => b.stats.views - a.stats.views)
  }, [vehicles, byVehicle, q])

  const max = rows[0]?.stats.views || 1

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
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-ink">
                Vistas y consultas — todos los vehículos
              </h3>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <div className="glass mb-4 flex h-10 items-center gap-2 rounded-xl px-3">
              <Search size={15} className="shrink-0 text-ink-3" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar marca o modelo…"
                autoFocus
                className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
              />
            </div>

            {rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-3">Sin resultados.</p>
            ) : (
              <ul className="max-h-[55vh] space-y-1 overflow-y-auto pr-1">
                {rows.map(({ v, stats }, i) => (
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
                          style={{ width: `${Math.round((stats.views / max) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-right">
                      <span className="flex items-center gap-1 text-sm font-bold text-ink">
                        <Eye size={13} className="text-ink-3" />
                        {stats.views.toLocaleString('es-AR')}
                      </span>
                      <span className="flex items-center gap-1 text-sm font-bold text-success">
                        <MessageCircle size={13} className="text-ink-3" />
                        {stats.conversions.toLocaleString('es-AR')}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
