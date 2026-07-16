import { motion } from 'framer-motion'
import StoryCard from './StoryCard'
import TestimonialCard from './TestimonialCard'
import { fadeUp, slideInLeft, slideInRight, staggerContainer } from '@/lib/animations'

/** Layout editorial en zig-zag: alterna reseñas y videos/fotos uno por
 *  fila, empezando siempre con una reseña. Cada elemento entra deslizándose
 *  desde su lateral (izquierda las impares, derecha las pares). */
export default function ZigZagSection({ stories = [] }) {
  const videos = stories.filter((s) => s.kind === 'video' || s.kind === 'photo')
  const testimonials = stories.filter((s) => s.kind === 'testimonial')

  // Intercalar empezando por reseña: reseña, video, reseña, video, …
  const rows = []
  let ti = 0
  let vi = 0
  let wantTestimonial = true
  while (ti < testimonials.length || vi < videos.length) {
    if (wantTestimonial && ti < testimonials.length) {
      rows.push({ type: 'testimonial', data: testimonials[ti] })
      ti++
    } else if (!wantTestimonial && vi < videos.length) {
      rows.push({ type: 'video', data: videos[vi] })
      vi++
    } else if (ti < testimonials.length) {
      rows.push({ type: 'testimonial', data: testimonials[ti] })
      ti++
    } else if (vi < videos.length) {
      rows.push({ type: 'video', data: videos[vi] })
      vi++
    }
    wantTestimonial = !wantTestimonial
  }

  if (rows.length === 0) return null

  return (
    <section className="space-y-14 py-6 md:space-y-24 md:py-10">
      {rows.map((row, i) => {
        const isLeft = i % 2 === 0
        const card =
          row.type === 'video' ? (
            <StoryCard story={row.data} />
          ) : (
            <TestimonialCard story={row.data} />
          )

        return (
          <motion.div
            key={i}
            variants={staggerContainer(0.12)}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-100px' }}
          >
            <motion.div
              variants={isLeft ? slideInLeft : slideInRight}
              className={isLeft ? 'md:mr-auto md:max-w-md' : 'md:ml-auto md:max-w-md'}
            >
              {card}
            </motion.div>
          </motion.div>
        )
      })}
    </section>
  )
}
