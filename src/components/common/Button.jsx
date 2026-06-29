import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

const VARIANTS = {
  primary: 'bg-neifert text-white shadow-glow-red hover:bg-neifert-dark',
  glass: 'glass text-ink hover:border-glassborder',
  ghost: 'text-ink-2 hover:text-ink hover:bg-surface',
  outline: 'border border-neifert text-neifert hover:bg-neifert hover:text-white',
  whatsapp: 'bg-whatsapp text-white',
}

const SIZES = {
  sm: 'h-9 px-4 text-xs',
  md: 'h-11 px-5 text-sm',
  lg: 'h-[52px] px-7 text-sm',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  icon: Icon,
  iconRight: IconRight,
  children,
  ...props
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-2xl font-semibold transition-all disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {Icon && <Icon size={17} />}
      {children}
      {IconRight && <IconRight size={17} />}
    </motion.button>
  )
}
