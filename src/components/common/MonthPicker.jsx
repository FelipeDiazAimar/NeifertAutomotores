import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/cn'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const ANIOS_POR_PAGINA = 12

/** Selector propio de mes ('yyyy-MM') o de año ('yyyy'), con el mismo estilo que DatePicker
 *  (el <input type="month"> / number nativo lo dibuja el sistema y no se puede estilizar). */
export default function MonthPicker({ mode = 'month', value, onChange, placeholder, compact = false }) {
  const hoy = new Date()
  const [open, setOpen] = useState(false)
  const [anioSel, mesSel] = value ? value.split('-').map(Number) : [null, null]
  // En modo mes: año que se muestra. En modo año: un año de la página que se muestra.
  const [cursor, setCursor] = useState(anioSel || hoy.getFullYear())
  const ref = useRef(null)

  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const inicioPagina = cursor - (cursor % ANIOS_POR_PAGINA)
  const texto = !value ? null : mode === 'year' ? String(anioSel) : `${MESES_LARGO[mesSel - 1]} de ${anioSel}`

  const elegir = (v) => {
    onChange(v)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative block">
      <button
        type="button"
        onClick={() => {
          setCursor(anioSel || hoy.getFullYear())
          setOpen((o) => !o)
        }}
        className={cn(
          'glass field-glass flex w-full items-center gap-2.5 rounded-2xl text-left text-sm transition-colors',
          compact ? 'h-9 px-3' : 'h-12 px-3.5',
          open && 'border-neifert'
        )}
      >
        <Calendar size={compact ? 15 : 17} className="shrink-0 text-ink-3" />
        <span className={cn('flex-1 truncate', texto ? 'capitalize text-ink' : 'text-ink-3')}>
          {texto || placeholder || (mode === 'year' ? 'Elegir año…' : 'Elegir mes…')}
        </span>
        {texto && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              onChange('')
            }}
            aria-label="Quitar"
            className="shrink-0 text-ink-3 transition-colors hover:text-neifert"
          >
            <X size={14} />
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
            className="glass glass-popover absolute left-0 z-30 mt-2 w-full min-w-64 rounded-2xl p-3 shadow-glass"
          >
            <div className="flex items-center justify-between px-1 pb-2">
              <button
                type="button"
                onClick={() => setCursor((c) => c - (mode === 'year' ? ANIOS_POR_PAGINA : 1))}
                aria-label={mode === 'year' ? 'Años anteriores' : 'Año anterior'}
                className="grid h-8 w-8 place-items-center rounded-full text-ink-2 transition-colors hover:text-neifert"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold text-ink">
                {mode === 'year' ? `${inicioPagina} – ${inicioPagina + ANIOS_POR_PAGINA - 1}` : cursor}
              </span>
              <button
                type="button"
                onClick={() => setCursor((c) => c + (mode === 'year' ? ANIOS_POR_PAGINA : 1))}
                aria-label={mode === 'year' ? 'Años siguientes' : 'Año siguiente'}
                className="grid h-8 w-8 place-items-center rounded-full text-ink-2 transition-colors hover:text-neifert"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {mode === 'year'
                ? Array.from({ length: ANIOS_POR_PAGINA }, (_, i) => inicioPagina + i).map((a) => (
                    <Celda key={a} activa={a === anioSel} hoy={a === hoy.getFullYear()} onClick={() => elegir(String(a))}>
                      {a}
                    </Celda>
                  ))
                : MESES.map((m, i) => (
                    <Celda
                      key={m}
                      activa={cursor === anioSel && i + 1 === mesSel}
                      hoy={cursor === hoy.getFullYear() && i === hoy.getMonth()}
                      onClick={() => elegir(`${cursor}-${String(i + 1).padStart(2, '0')}`)}
                    >
                      {m}
                    </Celda>
                  ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Celda({ activa, hoy, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-9 rounded-xl text-sm capitalize transition-colors',
        activa ? 'bg-neifert font-semibold text-white' : 'text-ink hover:bg-surface',
        !activa && hoy && 'font-bold text-neifert'
      )}
    >
      {children}
    </button>
  )
}
