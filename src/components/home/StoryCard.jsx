import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Play, Pause, ArrowRight, Loader2 } from 'lucide-react'

/** Tarjeta editorial de media (4:5, estilo Instagram).
 *  Video: se reproduce solo en loop al entrar en viewport; al tocarlo se pausa
 *  o reanuda (la pausa manual persiste). En vez de mostrar la duración, un borde
 *  rojo traza el perímetro de la tarjeta según el progreso del video. */
export default function StoryCard({ story }) {
  const isVideo = story.kind === 'video' && Boolean(story.video_url)
  const videoRef = useRef(null)
  const cardRef = useRef(null)
  const userPausedRef = useRef(false)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [size, setSize] = useState({ w: 0, h: 0 })
  // Loader del video: se muestra hasta que el navegador puede reproducirlo, y
  // vuelve a aparecer si el video se queda buffereando.
  const [videoLoading, setVideoLoading] = useState(isVideo)

  // Autoplay/pause según viewport (respeta la pausa manual del usuario)
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!userPausedRef.current) el.play().catch(() => {})
        } else {
          el.pause()
        }
      },
      { threshold: 0.5 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [isVideo])

  // Progreso del borde (rAF → suave y reinicia solo en el loop)
  useEffect(() => {
    if (!isVideo) return
    let raf
    const tick = () => {
      const el = videoRef.current
      if (el && el.duration) setProgress(el.currentTime / el.duration)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isVideo])

  // Medir la tarjeta para dibujar el borde SVG a medida
  useEffect(() => {
    if (!isVideo) return
    const el = cardRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      setSize({ w: Math.round(width), h: Math.round(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [isVideo])

  const togglePlay = () => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) {
      userPausedRef.current = false
      el.play().catch(() => {})
      setPaused(false)
    } else {
      userPausedRef.current = true
      el.pause()
      setPaused(true)
    }
  }

  return (
    <motion.div
      ref={cardRef}
      onClick={isVideo ? togglePlay : undefined}
      className={`group relative aspect-[4/5] overflow-hidden rounded-[20px] shadow-glass ${
        isVideo ? 'cursor-pointer' : ''
      }`}
    >
      {isVideo ? (
        <video
          ref={videoRef}
          src={story.video_url}
          poster={story.poster_url || undefined}
          muted
          loop
          playsInline
          preload="metadata"
          onLoadedData={() => setVideoLoading(false)}
          onCanPlay={() => setVideoLoading(false)}
          onPlaying={() => setVideoLoading(false)}
          onWaiting={() => setVideoLoading(true)}
          onError={() => setVideoLoading(false)}
          className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
        />
      ) : (
        <img
          src={story.poster_url}
          alt={story.title || ''}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-110"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* Loader del video hasta que esté listo para reproducirse */}
      {isVideo && videoLoading && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/30 backdrop-blur-[1px]">
          <Loader2 size={30} className="animate-spin text-white/90" />
        </div>
      )}

      {/* Borde rojo de progreso (solo video con archivo real) */}
      {isVideo && size.w > 0 && (
        <svg
          width={size.w}
          height={size.h}
          className="pointer-events-none absolute inset-0 z-20"
          fill="none"
        >
          <rect
            x="2"
            y="2"
            width={size.w - 4}
            height={size.h - 4}
            rx="18"
            ry="18"
            stroke="#be1e2d"
            strokeWidth="3.5"
            strokeLinecap="round"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset={1 - progress}
          />
        </svg>
      )}

      {/* Ícono de estado: play cuando está pausado, pause al hacer hover */}
      {isVideo && (
        <div
          className={`absolute left-1/2 top-1/2 z-20 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-black/35 text-white backdrop-blur-md transition-opacity ${
            paused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          {paused ? (
            <Play size={22} className="ml-0.5" fill="currentColor" />
          ) : (
            <Pause size={20} fill="currentColor" />
          )}
        </div>
      )}

      {/* Botón play para "video" sin archivo real (teaser/placeholder). No se
          muestra si la historia terminó siendo solo una imagen (poster). */}
      {story.kind === 'video' && !story.video_url && !story.poster_url && (
        <button
          aria-label={`Reproducir: ${story.title}`}
          className="absolute left-1/2 top-1/2 z-20 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-white/15 text-white backdrop-blur-md transition-transform duration-300 group-hover:scale-110"
        >
          <Play size={24} className="ml-1" fill="currentColor" />
        </button>
      )}

      <div className="absolute inset-x-4 bottom-4 z-10">
        {story.title && (
          <p className="font-display text-lg font-bold text-white drop-shadow-lg">
            {story.title}
          </p>
        )}
        {story.caption && (
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">
            {story.caption}
            <ArrowRight size={12} />
          </span>
        )}
      </div>
    </motion.div>
  )
}
