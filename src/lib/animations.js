/** Variants compartidos de Framer Motion para mantener consistencia. */

export const EASE = [0.16, 1, 0.3, 1] // easeOutExpo aprox (iOS feel)

export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
}

export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.5, ease: EASE } },
}

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: EASE } },
}

/** Contenedor con stagger para listas/grillas. */
export const staggerContainer = (stagger = 0.08, delay = 0) => ({
  hidden: {},
  show: {
    transition: { staggerChildren: stagger, delayChildren: delay },
  },
})

/** Transición de página (usado por PageTransition). */
export const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.25, ease: EASE } },
}

/** Hover de tarjeta (lift). */
export const cardHover = {
  rest: { y: 0 },
  hover: { y: -8, transition: { duration: 0.4, ease: EASE } },
}
