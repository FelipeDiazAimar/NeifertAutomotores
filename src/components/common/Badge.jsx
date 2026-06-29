import { cn } from '@/lib/cn'
import { LEAD_STATUSES } from '@/lib/constants'

const VARIANTS = {
  red: 'bg-neifert text-white',
  outline: 'border border-neifert text-neifert',
  green: 'bg-success/15 text-success',
  amber: 'bg-amber/15 text-amber',
  neutral: 'bg-ink/8 text-ink',
}

/** Badge genérico o de estado de lead (pasando `status`). */
export default function Badge({ variant = 'neutral', status, className, children }) {
  const cfg = status ? LEAD_STATUSES[status] : null
  const v = cfg?.variant || variant
  const label = children || cfg?.label
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
        VARIANTS[v],
        className
      )}
    >
      {label}
    </span>
  )
}
