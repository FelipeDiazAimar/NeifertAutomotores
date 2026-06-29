import { motion } from 'framer-motion'
import StoryCard from './StoryCard'
import TestimonialCard from './TestimonialCard'
import { fadeUp, staggerContainer } from '@/lib/animations'

/** Layout editorial en zig-zag: empareja testimonios con media (videos/fotos). */
export default function ZigZagSection({ stories = [] }) {
  const videos = stories.filter((s) => s.kind === 'video' || s.kind === 'photo')
  const testimonials = stories.filter((s) => s.kind === 'testimonial')
  const rows = Math.max(videos.length, testimonials.length)

  return (
    <section className="space-y-8 py-6 md:space-y-16 md:py-10">
      {Array.from({ length: rows }).map((_, i) => {
        const t = testimonials[i]
        const v = videos[i]
        const testimonialFirst = i % 2 === 0

        const reveal = {
          variants: staggerContainer(0.12),
          initial: 'hidden',
          whileInView: 'show',
          viewport: { once: true, margin: '-100px' },
        }

        if (!t || !v) {
          const only = t || v
          return (
            <motion.div key={i} {...reveal}>
              <motion.div variants={fadeUp} className="mx-auto max-w-2xl">
                {t ? <TestimonialCard story={only} /> : <StoryCard story={only} />}
              </motion.div>
            </motion.div>
          )
        }

        const first = testimonialFirst ? (
          <TestimonialCard story={t} />
        ) : (
          <StoryCard story={v} />
        )
        const second = testimonialFirst ? (
          <StoryCard story={v} />
        ) : (
          <TestimonialCard story={t} />
        )

        return (
          <motion.div
            key={i}
            {...reveal}
            className="grid items-center gap-6 md:grid-cols-2 md:gap-10"
          >
            <motion.div variants={fadeUp}>{first}</motion.div>
            <motion.div variants={fadeUp}>{second}</motion.div>
          </motion.div>
        )
      })}
    </section>
  )
}
