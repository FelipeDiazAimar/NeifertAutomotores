import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { EASE } from '@/lib/animations'
import { cn } from '@/lib/cn'

/** Carrusel de fotos del vehículo: autoplay con crossfade + indicadores de
 *  puntos (transparente / rojo activo). Si el usuario toca un punto o una
 *  flecha, se fija esa imagen y se detiene el autoplay. */
export default function VehicleGallery({ images = [], alt = '', isNew = false }) {
  const pics = images.filter(Boolean)
  const [idx, setIdx] = useState(0)
  const [locked, setLocked] = useState(false)
  const [failed, setFailed] = useState({})
  const timer = useRef(null)

  useEffect(() => {
    if (locked || pics.length < 2) return
    timer.current = setInterval(() => setIdx((i) => (i + 1) % pics.length), 3500)
    return () => clearInterval(timer.current)
  }, [locked, pics.length])

  const go = (n) => {
    setLocked(true)
    setIdx((n + pics.length) % pics.length)
  }

  if (pics.length === 0) {
    return (
      <div className="grid aspect-square w-full place-items-center rounded-[24px] bg-gradient-to-br from-[#2a2a30] to-[#0b0b0f]">
        <span className="font-display text-2xl font-bold uppercase tracking-widest text-white/25">
          {alt}
        </span>
      </div>
    )
  }

  return (
    <div className="group relative aspect-square overflow-hidden rounded-[24px] shadow-glass">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.img
          key={idx}
          src={pics[idx]}
          alt={alt}
          onError={() => setFailed((f) => ({ ...f, [idx]: true }))}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </AnimatePresence>
      {failed[idx] && (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#2a2a30] to-[#0b0b0f]">
          <span className="font-display text-2xl font-bold uppercase tracking-widest text-white/25">
            {alt}
          </span>
        </div>
      )}

      {isNew && (
        <span className="absolute right-4 top-4 z-10 rounded-full bg-neifert px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
          Nuevo
        </span>
      )}

      {pics.length > 1 && (
        <>
          <button
            onClick={() => go(idx - 1)}
            aria-label="Anterior"
            className="absolute left-3 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/30 bg-black/30 text-white opacity-0 backdrop-blur-md transition-opacity hover:bg-black/50 group-hover:opacity-100"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => go(idx + 1)}
            aria-label="Siguiente"
            className="absolute right-3 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/30 bg-black/30 text-white opacity-0 backdrop-blur-md transition-opacity hover:bg-black/50 group-hover:opacity-100"
          >
            <ChevronRight size={20} />
          </button>

          <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center gap-2">
            {pics.map((_, i) => (
              <button
                key={i}
                onClick={() => go(i)}
                aria-label={`Ver imagen ${i + 1}`}
                className={cn(
                  'h-2 rounded-full backdrop-blur-md transition-all duration-300',
                  i === idx
                    ? 'w-7 bg-neifert'
                    : 'w-2 bg-white/40 hover:bg-white/70'
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
