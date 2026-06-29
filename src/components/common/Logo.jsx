import { useUiStore } from '@/store/useUiStore'
import { cn } from '@/lib/cn'
import logoLight from '@/assets/images/logo-light.png'
import logoDark from '@/assets/images/logo-dark.png'

/** Wordmark Neifert. Los PNG traen fondo sólido (blanco/negro); usamos
 *  mix-blend para que el fondo "desaparezca" sobre cualquier superficie:
 *   - light: multiply → el blanco se vuelve transparente, el texto negro queda
 *   - dark:  screen   → el negro se vuelve transparente, el texto blanco queda
 *  En ambos casos el rojo del isotipo se preserva. */
export default function Logo({ className }) {
  const theme = useUiStore((s) => s.theme)
  const isDark = theme === 'dark'
  return (
    <img
      src={isDark ? logoDark : logoLight}
      alt="Neifert Automotores"
      draggable={false}
      className={cn('h-9 w-auto select-none object-contain', className)}
      style={{ mixBlendMode: isDark ? 'screen' : 'multiply' }}
    />
  )
}
