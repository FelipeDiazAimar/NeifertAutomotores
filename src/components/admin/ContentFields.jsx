import { cn } from '@/lib/cn'

export const inputCls =
  'glass field-glass h-11 w-full rounded-xl px-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-neifert'

export function TextField({ label, value, onChange, placeholder, textarea, className }) {
  return (
    <label className={cn('block', className)}>
      {label && (
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-3">
          {label}
        </span>
      )}
      {textarea ? (
        <textarea
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(inputCls, 'h-auto min-h-[88px] resize-none py-2.5')}
        />
      ) : (
        <input
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputCls}
        />
      )}
    </label>
  )
}

const VARIANT_OPTIONS = [
  { id: 'desktop', label: 'Escritorio' },
  { id: 'mobile', label: 'Celular' },
]

/** Pastilla para elegir qué versión de una imagen (escritorio/celular) se
 *  está editando. El punto junto a la etiqueta indica si esa versión ya
 *  tiene una imagen cargada. */
export function ImageVariantPicker({ variant, onChange, hasDesktop, hasMobile }) {
  const filled = { desktop: hasDesktop, mobile: hasMobile }
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1">
      {VARIANT_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all',
            variant === opt.id
              ? 'bg-neifert text-white shadow-glow-red'
              : 'text-ink-2 hover:bg-line hover:text-ink'
          )}
        >
          {opt.label}
          <span
            className={cn('h-1.5 w-1.5 rounded-full', filled[opt.id] ? 'bg-current' : 'bg-current/25')}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  )
}

export function Section({ title, desc, children, action }) {
  return (
    <div className="rounded-2xl border border-line p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-ink">{title}</h3>
          {desc && <p className="mt-0.5 text-xs text-ink-3">{desc}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}
