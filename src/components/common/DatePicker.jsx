import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  format,
  parseISO,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/cn'

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** Selector de fecha propio (no el <input type="date"> nativo): mismo
 *  lenguaje visual que el resto del sitio — el nativo lo dibuja el sistema
 *  operativo y no se puede estilizar de forma consistente. value/onChange
 *  son strings "yyyy-MM-dd" (o '' vacío). */
export default function DatePicker({ label, value, onChange, placeholder = 'Elegir fecha…' }) {
  const [open, setOpen] = useState(false)
  const selected = value ? parseISO(value) : null
  const [cursor, setCursor] = useState(selected || new Date())
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const monthStart = startOfMonth(cursor)
  const monthEnd = endOfMonth(cursor)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const pick = (day) => {
    onChange(format(day, 'yyyy-MM-dd'))
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative block">
      {label && (
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-3">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          setCursor(selected || new Date())
          setOpen((o) => !o)
        }}
        className={cn(
          'glass field-glass flex h-12 w-full items-center gap-2.5 rounded-2xl px-3.5 text-left text-sm transition-colors',
          open && 'border-neifert'
        )}
      >
        <Calendar size={17} className="shrink-0 text-ink-3" />
        <span className={cn('flex-1 truncate', selected ? 'text-ink' : 'text-ink-3')}>
          {selected ? format(selected, "d 'de' MMMM, yyyy", { locale: es }) : placeholder}
        </span>
        {selected && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              onChange('')
            }}
            aria-label="Quitar fecha"
            className="shrink-0 text-ink-3 transition-colors hover:text-neifert"
          >
            <X size={15} />
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="glass glass-popover absolute z-30 mt-2 w-72 rounded-2xl p-3 shadow-glass"
          >
            <div className="flex items-center justify-between px-1 pb-2">
              <button
                type="button"
                onClick={() => setCursor((c) => subMonths(c, 1))}
                aria-label="Mes anterior"
                className="grid h-8 w-8 place-items-center rounded-full text-ink-2 transition-colors hover:text-neifert"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold capitalize text-ink">
                {format(cursor, 'MMMM yyyy', { locale: es })}
              </span>
              <button
                type="button"
                onClick={() => setCursor((c) => addMonths(c, 1))}
                aria-label="Mes siguiente"
                className="grid h-8 w-8 place-items-center rounded-full text-ink-2 transition-colors hover:text-neifert"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 px-1 pb-1 text-center text-[11px] font-semibold text-ink-3">
              {WEEKDAYS.map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 px-1">
              {days.map((day) => {
                const inMonth = isSameMonth(day, cursor)
                const isSelected = selected && isSameDay(day, selected)
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => pick(day)}
                    className={cn(
                      'grid h-8 w-8 place-items-center rounded-full text-xs transition-colors',
                      !inMonth && 'text-ink-3/50',
                      inMonth && !isSelected && 'text-ink hover:bg-surface',
                      isSelected && 'bg-neifert font-semibold text-white',
                      !isSelected && isToday(day) && 'font-bold text-neifert'
                    )}
                  >
                    {format(day, 'd')}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                onChange(format(new Date(), 'yyyy-MM-dd'))
                setOpen(false)
              }}
              className="mt-2 w-full rounded-xl py-2 text-center text-xs font-semibold text-neifert transition-colors hover:bg-surface"
            >
              Hoy
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
