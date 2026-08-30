import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Play, Pause, Volume2, VolumeX, Loader2, Layers, Target, Telescope } from 'lucide-react'
import { useSiteStore } from '@/store/useSiteStore'
import { fadeUp, slideInLeft, slideInRight, staggerContainer } from '@/lib/animations'
import { HOME_ASPECT_RATIOS } from '@/lib/mediaFormats'
import { cn } from '@/lib/cn'

/** Coordina qué video de la sección tiene el sonido activo: cada <video> se
 *  registra acá y un único IntersectionObserver decide, según cuál tiene
 *  mayor porcentaje visible, cuál es el "activo" — el resto queda muteado.
 *  Respeta la pausa manual de cada video (no lo reanuda si el usuario lo
 *  pausó a mano). El sonido se habilita recién al primer tap sobre el
 *  parlante, respetando las políticas de autoplay de los navegadores. */
function useActiveVideoSection() {
  const [activeId, setActiveId] = useState(null)
  const [unlocked, setUnlocked] = useState(false)
  const videosRef = useRef(new Map())
  const pausedRef = useRef(new Map())
  const ratiosRef = useRef(new Map())
  const ioRef = useRef(null)

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.dataset.itemId
          ratiosRef.current.set(id, entry.isIntersecting ? entry.intersectionRatio : 0)
          if (entry.isIntersecting && !pausedRef.current.get(id)) entry.target.play().catch(() => {})
          else entry.target.pause()
        })
        let bestId = null
        let bestRatio = 0.5
        ratiosRef.current.forEach((ratio, id) => {
          if (ratio > bestRatio) {
            bestRatio = ratio
            bestId = id
          }
        })
        setActiveId((prev) => bestId ?? prev)
      },
      { threshold: [0, 0.25, 0.5, 0.6, 0.75, 1] }
    )
    ioRef.current = io
    videosRef.current.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const registerVideo = (id, el) => {
    if (!el) return
    el.dataset.itemId = id
    videosRef.current.set(id, el)
    ioRef.current?.observe(el)
  }

  const setManualPaused = (id, paused) => pausedRef.current.set(id, paused)
  const activate = (id) => {
    setUnlocked(true)
    setActiveId(id)
  }

  return { activeId, unlocked, registerVideo, setManualPaused, activate }
}

function SobreNosotrosBlock({ item, index, isActive, unlocked, onActivate, registerVideo, setManualPaused }) {
  const videoRef = useRef(null)
  const reverse = index % 2 === 0
  const [paused, setPaused] = useState(false)
  const [manualMuted, setManualMuted] = useState(null) // null = sigue al video "activo"
  const [loading, setLoading] = useState(true)
  const effectiveMuted = manualMuted ?? !(unlocked && isActive)

  useEffect(() => {
    const el = videoRef.current
    if (el) el.muted = effectiveMuted
  }, [effectiveMuted])

  const togglePlay = () => {
    const el = videoRef.current
    if (!el) return
    const next = !paused
    setPaused(next)
    setManualPaused(item.id, next)
    if (next) el.pause()
    else el.play().catch(() => {})
  }

  const toggleMute = (e) => {
    e.stopPropagation()
    if (effectiveMuted) {
      onActivate(item.id)
      setManualMuted(false)
    } else {
      setManualMuted(true)
    }
  }

  return (
    <motion.div
      variants={staggerContainer(0.1)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.3 }}
      className="grid items-center gap-8 md:grid-cols-2 md:gap-14"
    >
      <motion.div
        variants={reverse ? slideInLeft : slideInRight}
        className={cn('order-1', reverse ? 'md:order-1' : 'md:order-2')}
      >
        <h2 className="font-display text-3xl font-extrabold leading-tight text-ink md:text-4xl">
          {item.title}
        </h2>
        {item.text && (
          <p className="mt-4 whitespace-pre-line text-ink-2 md:text-lg">{item.text}</p>
        )}
      </motion.div>

      <motion.div
        variants={reverse ? slideInRight : slideInLeft}
        className={cn('order-2', reverse ? 'md:order-2' : 'md:order-1')}
      >
        <div
          onClick={togglePlay}
          className="group relative mx-auto w-full max-w-[380px] cursor-pointer overflow-hidden rounded-[28px] bg-black shadow-glass"
          style={{ aspectRatio: `${HOME_ASPECT_RATIOS.heroMobile.w}/${HOME_ASPECT_RATIOS.heroMobile.h}` }}
        >
          {item.video_url ? (
            <video
              ref={(el) => {
                videoRef.current = el
                registerVideo(item.id, el)
              }}
              src={item.video_url}
              muted
              loop
              playsInline
              preload="metadata"
              onLoadedData={() => setLoading(false)}
              onCanPlay={() => setLoading(false)}
              onPlaying={() => setLoading(false)}
              onWaiting={() => setLoading(true)}
              onError={() => setLoading(false)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center">
              <Layers size={32} className="text-white/30" />
            </div>
          )}

          {item.video_url && loading && (
            <div className="absolute inset-0 z-30 grid place-items-center bg-black/30 backdrop-blur-[1px]">
              <Loader2 size={30} className="animate-spin text-white/90" />
            </div>
          )}

          {item.video_url && !loading && (
            <div
              className={cn(
                'absolute left-1/2 top-1/2 z-20 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-black/35 text-white backdrop-blur-md transition-opacity',
                paused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              )}
            >
              {paused ? <Play size={22} className="ml-0.5" fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
            </div>
          )}

          {item.video_url && (
            <button
              type="button"
              onClick={toggleMute}
              aria-label={effectiveMuted ? 'Activar sonido' : 'Silenciar video'}
              className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-black/60"
            >
              {effectiveMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

/** Elige el ícono de cada bloque Misión/Visión según su título; si no coincide,
 *  alterna Target / Telescope por posición. */
function pickMVIcon(entry, index) {
  const t = String(entry.title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  if (t.includes('vision')) return Telescope
  if (t.includes('mision')) return Target
  return index % 2 === 0 ? Target : Telescope
}

export default function SobreNosotrosPage() {
  const sobreNosotros = useSiteStore((s) => s.sobreNosotros)
  const { activeId, unlocked, registerVideo, setManualPaused, activate } = useActiveVideoSection()
  // Guarda defensiva: localStorage de sesiones anteriores puede traer el
  // formato viejo (array plano) si la migración del store no llegó a correr.
  const items = Array.isArray(sobreNosotros) ? sobreNosotros : sobreNosotros?.items || []
  const misionVision = Array.isArray(sobreNosotros) ? [] : sobreNosotros?.misionVision || []
  const heading = Array.isArray(sobreNosotros)
    ? 'Nuestra historia, en primera persona'
    : sobreNosotros?.heading || ''

  return (
    <section className="mx-auto max-w-[1130px] px-4 py-12 md:px-8">
      <motion.div
        variants={staggerContainer(0.1, 0.05)}
        initial="hidden"
        animate="show"
        className="text-center"
      >
        <motion.span
          variants={fadeUp}
          className="inline-flex items-center gap-2 rounded-full bg-neifert/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-neifert"
        >
          Sobre Nosotros
        </motion.span>
        <motion.h1
          variants={fadeUp}
          className="mb-6 mt-5 font-display text-4xl font-extrabold leading-tight text-ink md:text-5xl"
        >
          {heading}
        </motion.h1>
      </motion.div>

      <div className="mt-8 space-y-16 md:mt-14 md:space-y-24">
        {items.map((item, i) => (
          <SobreNosotrosBlock
            key={item.id}
            item={item}
            index={i}
            isActive={activeId === item.id}
            unlocked={unlocked}
            onActivate={activate}
            registerVideo={registerVideo}
            setManualPaused={setManualPaused}
          />
        ))}
        {items.length === 0 && misionVision.length === 0 && (
          <div className="glass rounded-[20px] py-20 text-center">
            <Layers size={40} className="mx-auto mb-4 text-ink-3" />
            <p className="text-ink-3">Todavía no hay contenido cargado.</p>
          </div>
        )}
      </div>

      {misionVision.length > 0 && (
        <motion.div
          variants={staggerContainer(0.12)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="mx-auto mt-20 max-w-4xl space-y-14 md:mt-28 md:space-y-20"
        >
          {misionVision.map((entry, i) => {
            const Icon = pickMVIcon(entry, i)
            // Diagonal: los pares tiran a la izquierda, los impares a la
            // derecha (Misión arriba-izq., Visión abajo-der.).
            const toRight = i % 2 === 1
            return (
              <motion.article
                key={entry.id}
                variants={fadeUp}
                className={cn(
                  'w-full text-center md:max-w-[60%]',
                  toRight ? 'md:ml-auto' : 'md:mr-auto'
                )}
              >
                {entry.title && (
                  <h2 className="flex items-center justify-center gap-3 font-display text-2xl font-extrabold uppercase tracking-wide text-ink md:text-3xl">
                    <Icon className="h-7 w-7 shrink-0 text-neifert md:h-8 md:w-8" strokeWidth={1.75} />
                    {entry.title}
                  </h2>
                )}
                <span className="mx-auto mt-4 block h-[3px] w-16 rounded-full bg-neifert" />
                {entry.text && (
                  <p className="mx-auto mt-4 whitespace-pre-line text-ink-2 md:text-lg">
                    {entry.text}
                  </p>
                )}
              </motion.article>
            )
          })}
        </motion.div>
      )}
    </section>
  )
}
