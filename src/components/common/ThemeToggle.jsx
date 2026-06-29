import { AnimatePresence, motion } from 'framer-motion'
import { Sun, Moon } from 'lucide-react'
import { useUiStore } from '@/store/useUiStore'
import { cn } from '@/lib/cn'

export default function ThemeToggle({ className }) {
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
      className={cn(
        'glass grid h-10 w-10 place-items-center overflow-hidden rounded-full text-ink transition-colors hover:text-neifert',
        className
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ y: -14, opacity: 0, rotate: -40 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: 14, opacity: 0, rotate: 40 }}
          transition={{ duration: 0.25 }}
          className="grid place-items-center"
        >
          {isDark ? <Moon size={18} /> : <Sun size={18} />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}
