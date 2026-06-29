import { cn } from '@/lib/cn'

/** Superficie base de glassmorphism. */
export default function GlassCard({ as: Comp = 'div', className, children, ...props }) {
  return (
    <Comp
      className={cn('glass rounded-[20px] shadow-glass', className)}
      {...props}
    >
      {children}
    </Comp>
  )
}
