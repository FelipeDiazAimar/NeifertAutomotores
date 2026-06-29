import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Play, ArrowRight } from 'lucide-react'

/** Tarjeta editorial de media: video (se reproduce solo al entrar en viewport)
 *  o foto. Muestra título, caption y duración. */
export default function StoryCard({ story }) {
  const isVideo = story.kind === 'video' && Boolean(story.video_url)
  const videoRef = useRef(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) el.play().catch(() => {})
        else el.pause()
      },
      { threshold: 0.5 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [story.video_url])

  return (
    <motion.div
      initial="rest"
      whileHover="hover"
      animate="rest"
      className="group relative aspect-[16/11] overflow-hidden rounded-[20px] shadow-glass"
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

      {story.duration && (
        <span className="absolute left-4 top-4 rounded-full bg-black/50 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-md">
          {story.duration}
        </span>
      )}

      {/* Botón play solo para "video" sin archivo real (teaser) */}
      {story.kind === 'video' && !story.video_url && (
        <motion.button
          variants={{ rest: { scale: 1 }, hover: { scale: 1.12 } }}
          aria-label={`Reproducir: ${story.title}`}
          className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-white/15 text-white backdrop-blur-md"
        >
          <Play size={24} className="ml-1" fill="currentColor" />
        </motion.button>
      )}

      <div className="absolute inset-x-4 bottom-4">
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
