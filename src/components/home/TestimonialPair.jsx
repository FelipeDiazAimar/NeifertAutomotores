import { motion } from 'framer-motion'
import TestimonialCard from './TestimonialCard'
import { fadeUp, staggerContainer } from '@/lib/animations'

/** Dos testimonios junto a un mismo video: no apilados uno encima del otro,
 *  sino desplazados en diagonal (el segundo va más abajo y corrido hacia el
 *  costado contrario, como una cascada). */
export default function TestimonialPair({ stories = [] }) {
  const [first, second] = stories

  return (
    <motion.div
      variants={staggerContainer(0.15)}
      className="relative flex flex-col gap-5"
    >
      {first && (
        <motion.div variants={fadeUp} className="w-[92%] max-w-md">
          <TestimonialCard story={first} />
        </motion.div>
      )}
      {second && (
        <motion.div variants={fadeUp} className="w-[92%] max-w-md self-end">
          <TestimonialCard story={second} />
        </motion.div>
      )}
    </motion.div>
  )
}
