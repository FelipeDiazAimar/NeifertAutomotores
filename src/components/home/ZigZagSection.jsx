import { motion } from 'framer-motion'
import StoryCard from './StoryCard'
import TestimonialCard from './TestimonialCard'
import TestimonialPair from './TestimonialPair'
import { fadeUp, slideInLeft, slideInRight, staggerContainer } from '@/lib/animations'

const reveal = (variants, margin = '-100px') => ({
  variants,
  initial: 'hidden',
  whileInView: 'show',
  viewport: { once: true, margin },
})

/** Home: reseñas y videos/fotos.
 *  - Mobile: uno por uno, alternando reseña/video (sin cambios).
 *  - Desktop: cada fila junta 1 video + 2 reseñas (apiladas pero en
 *    diagonal entre sí, vía TestimonialPair), alternando de qué lado
 *    queda el video — fila 1: reseñas | video, fila 2: video | reseñas. */
export default function ZigZagSection({ stories = [] }) {
  const videos = stories.filter((s) => s.kind === 'video' || s.kind === 'photo')
  const testimonials = stories.filter((s) => s.kind === 'testimonial')

  if (videos.length === 0 && testimonials.length === 0) return null

  // --- Mobile: intercalado simple, empezando por reseña ---
  const simpleRows = []
  {
    let ti = 0
    let vi = 0
    let wantTestimonial = true
    while (ti < testimonials.length || vi < videos.length) {
      if (wantTestimonial && ti < testimonials.length) {
        simpleRows.push({ type: 'testimonial', data: testimonials[ti++] })
      } else if (!wantTestimonial && vi < videos.length) {
        simpleRows.push({ type: 'video', data: videos[vi++] })
      } else if (ti < testimonials.length) {
        simpleRows.push({ type: 'testimonial', data: testimonials[ti++] })
      } else if (vi < videos.length) {
        simpleRows.push({ type: 'video', data: videos[vi++] })
      }
      wantTestimonial = !wantTestimonial
    }
  }

  // --- Desktop: 1 video + 2 reseñas por fila ---
  const pairedRows = []
  {
    const rowCount = Math.max(videos.length, Math.ceil(testimonials.length / 2))
    for (let i = 0; i < rowCount; i++) {
      pairedRows.push({
        video: videos[i] || null,
        pair: [testimonials[i * 2], testimonials[i * 2 + 1]].filter(Boolean),
      })
    }
  }

  return (
    <>
      {/* Mobile */}
      <section className="space-y-14 py-6 md:hidden">
        {simpleRows.map((row, i) => (
          <motion.div key={i} {...reveal(fadeUp, '-80px')}>
            {row.type === 'video' ? <StoryCard story={row.data} /> : <TestimonialCard story={row.data} />}
          </motion.div>
        ))}
      </section>

      {/* Desktop */}
      <section className="hidden space-y-24 py-10 md:block">
        {pairedRows.map((row, i) => {
          const videoOnLeft = i % 2 === 1 // fila 0 (par): reseñas | video — fila 1 (impar): video | reseñas
          const videoEl = row.video && <StoryCard story={row.video} />
          const pairEl = row.pair.length > 0 && <TestimonialPair stories={row.pair} />

          if (videoEl && pairEl) {
            return (
              <motion.div
                key={i}
                {...reveal(staggerContainer(0.12))}
                className="grid grid-cols-2 items-center gap-12"
              >
                <motion.div variants={videoOnLeft ? slideInLeft : slideInRight}>
                  {videoOnLeft ? videoEl : pairEl}
                </motion.div>
                <motion.div variants={videoOnLeft ? slideInRight : slideInLeft}>
                  {videoOnLeft ? pairEl : videoEl}
                </motion.div>
              </motion.div>
            )
          }

          // Fila incompleta (sobró un video o reseñas sin su par): sola y centrada.
          return (
            <motion.div key={i} {...reveal(fadeUp)} className="mx-auto max-w-2xl">
              {videoEl || pairEl}
            </motion.div>
          )
        })}
      </section>
    </>
  )
}
