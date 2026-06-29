import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Une clases de Tailwind resolviendo conflictos (p. ej. p-2 + p-4 → p-4). */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
