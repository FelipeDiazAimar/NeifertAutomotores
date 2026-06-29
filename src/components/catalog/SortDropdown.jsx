import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Check } from 'lucide-react'
import { SORT_OPTIONS } from '@/lib/constants'
import { useCatalogStore } from '@/store/useCatalogStore'
import { cn } from '@/lib/cn'

export default function SortDropdown({ sort: sortProp, setSort: setSortProp }) {
  const storeSort = useCatalogStore((s) => s.sort)
  const storeSetSort = useCatalogStore((s) => s.setSort)
  const sort = sortProp ?? storeSort
  const setSort = setSortProp ?? storeSetSort
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = SORT_OPTIONS.find((o) => o.id === sort)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="glass flex h-10 items-center gap-2 rounded-xl px-3 text-sm text-ink"
      >
        <span className="hidden text-ink-3 sm:inline">Ordenar por:</span>
        <span className="font-semibold">{current?.label}</span>
        <ChevronDown size={15} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="glass absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl p-1 shadow-glass"
          >
            {SORT_OPTIONS.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => {
                    setSort(o.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-surface',
                    o.id === sort ? 'text-neifert' : 'text-ink'
                  )}
                >
                  {o.label}
                  {o.id === sort && <Check size={14} />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
