import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { VISTAS } from '@/crm/lib/vistas'

/** Grilla de las 6 vistas top-level como checkboxes. `value`: string[] de keys. */
export default function VistasChecklist({ value = [], onChange, disabled = false }) {
  const set = new Set(value)
  const toggle = (key) => {
    if (disabled) return
    const next = new Set(set)
    next.has(key) ? next.delete(key) : next.add(key)
    onChange(VISTAS.filter((v) => next.has(v.key)).map((v) => v.key))
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {VISTAS.map((v) => {
        const on = set.has(v.key)
        return (
          <button
            key={v.key}
            type="button"
            role="checkbox"
            aria-checked={on}
            aria-label={v.label}
            disabled={disabled}
            onClick={() => toggle(v.key)}
            className={cn(
              'glass flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm transition-colors',
              on ? 'border-neifert text-ink' : 'text-ink-3 hover:text-ink',
              disabled && 'opacity-50',
            )}
          >
            <span
              className={cn(
                'grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors',
                on ? 'border-neifert bg-neifert text-white' : 'border-ink/30 text-transparent',
              )}
            >
              <Check size={12} />
            </span>
            {v.label}
          </button>
        )
      })}
    </div>
  )
}
