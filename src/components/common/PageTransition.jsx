import { motion } from 'framer-motion'
import { pageVariants } from '@/lib/animations'

/** Envoltorio de transición entre rutas (usar dentro de AnimatePresence). */
export default function PageTransition({ children, className }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={className}
    >
      {children}
    </motion.div>
  )
}
