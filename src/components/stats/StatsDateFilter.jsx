import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Filter, Check } from 'lucide-react'
import DatePicker from '@/components/common/DatePicker'
import MonthPicker from '@/components/common/MonthPicker'
import { cn } from '@/lib/cn'

const DAY = 86_400_000

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Presets rápidos → {from, to, label}. */
const PRESETS = [
  { id: 'all', label: 'Todo el período', range: () => ({ from: null, to: null }) },
  { id: 'today', label: 'Hoy', range: () => ({ from: startOfToday(), to: Date.now() }) },
  { id: '7d', label: 'Últimos 7 días', range: () => ({ from: Date.now() - 7 * DAY, to: Date.now() }) },
  { id: '30d', label: 'Últimos 30 días', range: () => ({ from: Date.now() - 30 * DAY, to: Date.now() }) },
  {
    id: 'month',
    label: 'Este mes',
    range: () => {
      const n = new Date()
      return { from: new Date(n.getFullYear(), n.getMonth(), 1).getTime(), to: Date.now() }
    },
  },
  {
    id: 'year',
    label: 'Este año',
    range: () => {
      const n = new Date()
      return { from: new Date(n.getFullYear(), 0, 1).getTime(), to: Date.now() }
    },
  },
]

export default function StatsDateFilter({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState('') // 'YYYY-MM'
  const [year, setYear] = useState('')
  const [from, setFrom] = useState('') // 'YYYY-MM-DD'
  const [to, setTo] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const apply = (range, label) => {
    onChange({ ...range, label })
    setOpen(false)
  }

  const applyMonth = (val) => {
    setMonth(val)
    if (!val) return
    const [y, m] = val.split('-').map(Number)
    const f = new Date(y, m - 1, 1).getTime()
    const t = new Date(y, m, 0, 23, 59, 59).getTime()
    apply({ from: f, to: t }, new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }))
  }

  const applyYear = (val) => {
    setYear(val)
    const y = Number(val)
    if (!y) return
    apply({ from: new Date(y, 0, 1).getTime(), to: new Date(y, 11, 31, 23, 59, 59).getTime() }, String(y))
  }

  const applyRange = (f, t) => {
    if (!f || !t) return
    apply(
      { from: new Date(f).getTime(), to: new Date(t + 'T23:59:59').getTime() },
      `${new Date(f).toLocaleDateString('es-AR')} – ${new Date(t).toLocaleDateString('es-AR')}`
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="glass flex h-9 items-center gap-2 rounded-xl px-3 text-sm text-ink"
      >
        <Filter size={15} />
        <span className="font-semibold">{value?.label || 'Filtrar'}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="glass absolute right-0 z-30 mt-2 w-[min(92vw,20rem)] rounded-2xl p-3 shadow-glass"
          >
            <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-ink-3">
              Rápido
            </p>
            <div className="space-y-0.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => apply(p.range(), p.label)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-surface',
                    value?.label === p.label ? 'text-neifert' : 'text-ink'
                  )}
                >
                  {p.label}
                  {value?.label === p.label && <Check size={14} />}
                </button>
              ))}
            </div>

            <div className="mt-3 space-y-3 border-t border-line pt-3">
              <div>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-3">
                  Por mes
                </span>
                <MonthPicker compact mode="month" value={month} onChange={applyMonth} />
              </div>
              <div>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-3">
                  Por año
                </span>
                <MonthPicker compact mode="year" value={year} onChange={applyYear} />
              </div>
              <div>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-3">
                  Rango personalizado
                </span>
                <div className="flex flex-col gap-2">
                  <DatePicker compact value={from} placeholder="Desde…" onChange={(v) => { setFrom(v); applyRange(v, to) }} />
                  <DatePicker compact value={to} placeholder="Hasta…" onChange={(v) => { setTo(v); applyRange(from, v) }} />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
