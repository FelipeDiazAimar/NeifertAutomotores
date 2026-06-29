import { fadeUp } from '@/lib/animations'

/** Props listos para spreadear en un <motion.div> y revelar al hacer scroll.
 *  Uso: <motion.div {...useScrollReveal()} /> */
export function useScrollReveal(variants = fadeUp, viewport = {}) {
  return {
    variants,
    initial: 'hidden',
    whileInView: 'show',
    viewport: { once: true, margin: '-80px', ...viewport },
  }
}
