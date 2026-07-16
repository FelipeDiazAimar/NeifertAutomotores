import { motion } from 'framer-motion'
import StoryCard from './StoryCard'
import TestimonialCard from './TestimonialCard'
import TestimonialPair from './TestimonialPair'
import { fadeUp, slideInLeft, slideInRight, staggerContainer } from '@/lib/animations'

/** Layout editorial en zig-zag: cada video se empareja con DOS testimonios
 *  (en diagonal, no apilados uno encima del otro). Alterna de qué lado
 *  aparece el video, y cada columna entra deslizándose desde su lateral. */
export default function ZigZagSection({ stories = [] }) {
  const videos = stories.filter((s) => s.kind === 'video' || s.kind === 'photo')
  const testimonials = stories.filter((s) => s.kind === 'testimonial')
  const rows = videos.length

  const reveal = (i) => ({
    variants: staggerContainer(0.12),
    initial: 'hidden',
    whileInView: 'show',
    viewport: { once: true, margin: '-100px' },
    key: i,
  })

  const rowsEls = Array.from({ length: rows }).map((_, i) => {
    const v = videos[i]
    const t1 = testimonials[2 * i]
    const t2 = testimonials[2 * i + 1]
    const testimonialFirst = i % 2 === 0

    // Sin testimonios disponibles para este video: se muestra solo, centrado.
    if (!t1 && !t2) {
      return (
        <motion.div {...reveal(i)}>
          <motion.div variants={fadeUp} className="mx-auto max-w-2xl">
            <StoryCard story={v} />
          </motion.div>
        </motion.div>
      )
    }

    const testimonialBlock = t2 ? (
      <TestimonialPair stories={[t1, t2]} />
    ) : (
      <TestimonialCard story={t1} />
    )

    const first = testimonialFirst ? testimonialBlock : <StoryCard story={v} />
    const second = testimonialFirst ? <StoryCard story={v} /> : testimonialBlock

    return (
      <motion.div {...reveal(i)} className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
        <motion.div variants={slideInLeft}>{first}</motion.div>
        <motion.div variants={slideInRight}>{second}</motion.div>
      </motion.div>
    )
  })

  // Testimonios que sobraron (más de 2 por video) van al final, en pares.
  const leftover = testimonials.slice(2 * rows)
  const leftoverEls = []
  for (let i = 0; i < leftover.length; i += 2) {
    const pair = leftover.slice(i, i + 2)
    leftoverEls.push(
      <motion.div {...reveal(`leftover-${i}`)}>
        <motion.div variants={fadeUp} className="mx-auto max-w-md">
          {pair.length === 2 ? <TestimonialPair stories={pair} /> : <TestimonialCard story={pair[0]} />}
        </motion.div>
      </motion.div>
    )
  }

  return <section className="space-y-10 py-6 md:space-y-20 md:py-10">{[...rowsEls, ...leftoverEls]}</section>
}
