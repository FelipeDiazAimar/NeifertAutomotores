import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock, X } from 'lucide-react'
import { cn } from '@/lib/cn'

const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTOS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

/** Selector de hora propio (no el <input type="time"> nativo): dos columnas, horas y
 *  minutos. value/onChange son strings "HH:mm" (o '' vacío). */
export default function TimePicker({ label, value, onChange, placeholder = 'Elegir hora…', compact = false, error }) {
  const [open, setOpen] = useState(false)
  const [hh, mm] = value ? value.split(':') : [null, null]
  const ref = useRef(null)
  const colH = useRef(null)
  const colM = useRef(null)

  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Al abrir, deja a la vista la hora y el minuto elegidos.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      for (const [col, sel] of [[colH, hh], [colM, mm]]) {
        const el = col.current?.querySelector(`[data-v="${sel}"]`)
        if (el) col.current.scrollTop = el.offsetTop - 72
      }
    }, 0)
    return () => clearTimeout(t)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const elegirHora = (h) => onChange(`${h}:${mm ?? '00'}`)
  const elegirMinuto = (m) => {
    onChange(`${hh ?? '09'}:${m}`)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative block">
      {label && (
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</span>
      )}
      <button
        type="button"
        aria-label={label || placeholder}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'glass field-glass flex w-full items-center gap-2.5 rounded-2xl text-left text-sm transition-colors',
          compact ? 'h-9 px-3' : 'h-12 px-3.5',
          (open || error) && 'border-neifert'
        )}
      >
        <Clock size={compact ? 15 : 17} className="shrink-0 text-ink-3" />
        <span className={cn('flex-1 truncate tabular-nums', value ? 'text-ink' : 'text-ink-3')}>
          {value ? `${value} hs` : placeholder}
        </span>
        {value && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              onChange('')
            }}
            aria-label="Quitar hora"
            className="shrink-0 text-ink-3 transition-colors hover:text-neifert"
          >
            <X size={14} />
          </span>
        )}
      </button>
      {error && <p className="mt-1 text-xs text-neifert">{error}</p>}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="glass glass-popover absolute left-0 z-30 mt-2 w-full min-w-48 rounded-2xl p-3 shadow-glass"
          >
            <div className="grid grid-cols-2 gap-2">
              {[
                ['Hora', HORAS, hh, elegirHora, colH],
                ['Min', MINUTOS, mm, elegirMinuto, colM],
              ].map(([titulo, items, sel, accion, refCol]) => (
                <div key={titulo}>
                  <p className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-3">{titulo}</p>
                  {/* data-lenis-prevent: que la rueda scrollee la lista y no la página */}
                  <div ref={refCol} data-lenis-prevent data-col={titulo} className="relative h-44 space-y-0.5 overflow-y-auto pr-1">
                    {items.map((v) => (
                      <button
                        key={v}
                        type="button"
                        data-v={v}
                        onClick={() => accion(v)}
                        className={cn(
                          'block h-8 w-full rounded-lg text-center text-sm tabular-nums transition-colors',
                          v === sel ? 'bg-neifert font-semibold text-white' : 'text-ink hover:bg-surface'
                        )}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
