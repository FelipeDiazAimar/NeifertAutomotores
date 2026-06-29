import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

/** Input/textarea glass con label, ícono y error. Compatible con react-hook-form. */
const Input = forwardRef(function Input(
  { label, icon: Icon, error, as = 'input', className, ...props },
  ref
) {
  const Field = as
  const isArea = as === 'textarea'
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-3">
          {label}
        </span>
      )}
      <div
        className={cn(
          'glass flex gap-2.5 rounded-2xl px-3.5 transition-colors focus-within:border-neifert',
          isArea ? 'items-start py-3' : 'h-12 items-center',
          error && 'border-neifert'
        )}
      >
        {Icon && <Icon size={17} className="mt-px shrink-0 text-ink-3" />}
        <Field
          ref={ref}
          className={cn(
            'w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3',
            isArea && 'min-h-[84px] resize-none',
            className
          )}
          {...props}
        />
      </div>
      {error && <span className="mt-1 block text-xs text-neifert">{error}</span>}
    </label>
  )
})

export default Input
