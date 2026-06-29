import { Suspense } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { pageVariants } from '@/lib/animations'
import Spinner from '@/components/common/Spinner'

/** Renderiza la ruta hija con transición de entrada/salida, manteniendo el
 *  layout (nav/sidebar) montado para que no parpadee al navegar. El Suspense
 *  interno deja el layout visible mientras carga el chunk de la página. */
export default function AnimatedOutlet() {
  const location = useLocation()
  const outlet = useOutlet()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <Suspense
          fallback={
            <div className="grid min-h-[50vh] place-items-center">
              <Spinner size={28} />
            </div>
          }
        >
          {outlet}
        </Suspense>
      </motion.div>
    </AnimatePresence>
  )
}
