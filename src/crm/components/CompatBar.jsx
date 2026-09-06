import { cn } from '@/lib/cn'

const COLOR = { alta: 'bg-success', media: 'bg-amber', baja: 'bg-neifert' }

export default function CompatBar({ score, bucket, className }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="img"
        aria-label={`Compatibilidad ${score}%`}
        className="h-2 w-24 overflow-hidden rounded-full bg-ink/10"
      >
        <span className={cn('block h-full rounded-full', COLOR[bucket] ?? 'bg-ink/30')} style={{ width: `${score}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-xs font-semibold text-ink-2">{score}%</span>
    </div>
  )
}
