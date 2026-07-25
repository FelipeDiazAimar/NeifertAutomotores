import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Select propio (no el <select> nativo): mismo lenguaje visual que los
 *  inputs glass del sitio. El control nativo lo dibuja el sistema operativo
 *  (el popup de opciones no se puede estilizar de forma consistente entre
 *  navegadores/temas) — este sí. `options`: [{ id, label }]. */
export default function Select({
  label,
  icon: Icon,
  value,
  onChange,
  options,
  placeholder = 'Seleccionar…',
  error,
  size = 'md',
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = options.find((o) => o.id === value)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative block">
      {label && (
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-3">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'glass field-glass flex w-full items-center gap-2.5 rounded-2xl text-left text-sm transition-colors',
          size === 'sm' ? 'h-10 px-3' : 'h-12 px-3.5',
          (open || error) && 'border-neifert'
        )}
      >
        {Icon && <Icon size={17} className="shrink-0 text-ink-3" />}
        <span className={cn('flex-1 truncate', current ? 'text-ink' : 'text-ink-3')}>
          {current?.label || placeholder}
        </span>
        <ChevronDown size={16} className={cn('shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="glass glass-popover absolute z-30 mt-2 max-h-64 w-max min-w-full overflow-auto rounded-2xl p-1 shadow-glass"
          >
            {options.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface',
                    o.id === value ? 'text-neifert' : 'text-ink'
                  )}
                >
                  {o.label}
                  {o.id === value && <Check size={14} />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
      {error && <span className="mt-1 block text-xs text-neifert">{error}</span>}
    </div>
  )
}
