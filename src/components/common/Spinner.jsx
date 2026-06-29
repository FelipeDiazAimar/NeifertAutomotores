import { cn } from '@/lib/cn'

export default function Spinner({ className, size = 24 }) {
  return (
    <span
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-ink-3/30 border-t-neifert',
        className
      )}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Cargando"
    />
  )
}
