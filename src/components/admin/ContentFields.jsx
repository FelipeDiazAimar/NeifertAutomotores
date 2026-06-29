import { cn } from '@/lib/cn'

export const inputCls =
  'glass h-11 w-full rounded-xl px-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-neifert'

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
