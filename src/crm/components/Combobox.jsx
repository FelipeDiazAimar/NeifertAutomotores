import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Check, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Como <Select> pero escribible: el disparador es un input de texto. Ofrece
 *  `options` (strings) filtradas por lo tipeado y permite usar un valor nuevo
 *  que no este en la lista. `value` / `onChange` trabajan con strings. */
export default function Combobox({
  label,
  icon: Icon,
  value = '',
  onChange,
  options = [],
  placeholder = 'Escribí o elegí…',
  error,
  size = 'md',
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const id = useId()

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const texto = value ?? ''
  const q = texto.trim().toLowerCase()
  const filtradas = q ? options.filter((o) => o.toLowerCase().includes(q)) : options
  const hayExacta = options.some((o) => o.toLowerCase() === q)
  const mostrarNueva = q.length > 0 && !hayExacta

  return (
    <div ref={ref} className="relative block">
      {label && (
        <label
          htmlFor={id}
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-3"
        >
          {label}
        </label>
      )}
      <div
        className={cn(
          'glass field-glass flex w-full items-center gap-2.5 rounded-2xl text-left text-sm transition-colors',
          size === 'sm' ? 'h-10 px-3' : 'h-12 px-3.5',
          (open || error) && 'border-neifert',
        )}
      >
        {Icon && <Icon size={17} className="shrink-0 text-ink-3" />}
        <input
          id={id}
          type="text"
          value={texto}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Ver opciones"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 text-ink-3"
        >
          <ChevronDown size={16} className={cn('transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      <AnimatePresence>
        {open && (filtradas.length > 0 || mostrarNueva) && (
          <motion.ul
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="glass glass-popover absolute z-30 mt-2 max-h-64 w-max min-w-full overflow-auto rounded-2xl p-1 shadow-glass"
          >
            {mostrarNueva && (
              <li>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-neifert transition-colors hover:bg-surface"
                >
                  <Plus size={14} />
                  Usar «{texto.trim()}»
                </button>
              </li>
            )}
            {filtradas.map((o) => (
              <li key={o}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface',
                    o.toLowerCase() === q ? 'text-neifert' : 'text-ink',
                  )}
                >
                  {o}
                  {o.toLowerCase() === q && <Check size={14} />}
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
