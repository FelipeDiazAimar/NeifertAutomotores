import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useSiteStore } from '@/store/useSiteStore'
import { EASE } from '@/lib/animations'
import { cn } from '@/lib/cn'

const AUTOPLAY_MS = 5500
const PAUSE_AFTER_INTERACTION_MS = 60_000
const SWIPE_DISTANCE = 80
const SWIPE_VELOCITY = 500

// Alto exacto del header (pt-3 + h-16 = 12px + 64px) — se usa para que el
// carrusel arranque debajo del header pero se vea "por atrás" de él.
const HEADER_H = 76

// Desplazamiento 100% horizontal (la imagen entra/sale corriéndose de lado,
// sin fundido) — la nueva entra desde el lado hacia donde se navega, la
// anterior se corre hacia el lado contrario.
const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? '100%' : '-100%' }),
  center: { x: 0, transition: { duration: 0.65, ease: EASE } },
  exit: (dir) => ({ x: dir > 0 ? '-100%' : '100%', transition: { duration: 0.65, ease: EASE } }),
}

const textVariants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE, delay: 0.3 } },
  exit: { opacity: 0, y: -14, transition: { duration: 0.3 } },
}

export default function HeroCarousel() {
  const slides = useSiteStore((s) => s.heroSlides)
  const count = slides.length

  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const pausedUntilRef = useRef(0)
  const safeIndex = count > 0 ? ((index % count) + count) % count : 0

  const goTo = useCallback(
    (i, dir = 1) => {
      if (count === 0) return
      setDirection(dir)
      setIndex(((i % count) + count) % count)
    },
    [count]
  )

  const pauseAutoplay = () => {
    pausedUntilRef.current = Date.now() + PAUSE_AFTER_INTERACTION_MS
  }

  // Autoplay: avanza solo, salvo que el usuario haya interactuado hace <1min.
  useEffect(() => {
    if (count < 2) return
    const id = setInterval(() => {
      if (Date.now() >= pausedUntilRef.current) {
        setDirection(1)
        setIndex((i) => (i + 1) % count)
      }
    }, AUTOPLAY_MS)
    return () => clearInterval(id)
  }, [count])

  const onDragEnd = (_e, info) => {
    pauseAutoplay()
    const { offset, velocity } = info
    if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) {
      goTo(safeIndex + 1, 1)
    } else if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) {
      goTo(safeIndex - 1, -1)
    }
  }

  if (count === 0) return null

  const slide = slides[safeIndex]

  return (
    <section
      className="relative w-full overflow-hidden bg-ink"
      style={{ marginTop: -HEADER_H, height: `calc(86vh + ${HEADER_H}px)`, minHeight: 560 + HEADER_H }}
    >
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={slide.id}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={onDragEnd}
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
        >
          {slide.image && (
            <img
              src={slide.image}
              alt=""
              draggable={false}
              className="pointer-events-none h-full w-full select-none object-cover"
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/45" />
        </motion.div>
      </AnimatePresence>

      {/* Texto centrado, animado en cada cambio de slide */}
      <div
        className="pointer-events-none absolute inset-0 z-10 grid place-items-center px-4"
        style={{ paddingTop: HEADER_H }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            variants={textVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            className="max-w-2xl text-center"
          >
            {slide.title && (
              <h2 className="font-display text-3xl font-extrabold leading-tight text-white drop-shadow-lg md:text-5xl">
                {slide.title}
              </h2>
            )}
            {slide.subtitle && (
              <p className="mx-auto mt-4 max-w-xl text-sm text-white/85 drop-shadow md:text-lg">
                {slide.subtitle}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {count > 1 && (
        <>
          <button
            onClick={() => {
              pauseAutoplay()
              goTo(safeIndex - 1, -1)
            }}
            aria-label="Imagen anterior"
            className="absolute left-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/30 bg-black/30 text-white backdrop-blur-md transition-colors hover:bg-black/50 md:left-6"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            onClick={() => {
              pauseAutoplay()
              goTo(safeIndex + 1, 1)
            }}
            aria-label="Imagen siguiente"
            className="absolute right-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/30 bg-black/30 text-white backdrop-blur-md transition-colors hover:bg-black/50 md:right-6"
          >
            <ChevronRight size={22} />
          </button>

          <div className="absolute inset-x-0 bottom-6 z-10 flex justify-center gap-2">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => {
                  pauseAutoplay()
                  goTo(i, i > safeIndex ? 1 : -1)
                }}
                aria-label={`Ir a la imagen ${i + 1}`}
                className={cn(
                  'h-2 rounded-full backdrop-blur-md transition-all duration-300',
                  i === safeIndex ? 'w-7 bg-white' : 'w-2 bg-white/50 hover:bg-white/75'
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
