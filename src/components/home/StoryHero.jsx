import { motion } from 'framer-motion'
import { fadeUp, staggerContainer } from '@/lib/animations'
import { useSiteStore } from '@/store/useSiteStore'

export default function StoryHero() {
  const home = useSiteStore((s) => s.home)
  return (
    <motion.section
      variants={staggerContainer(0.12, 0.1)}
      initial="hidden"
      animate="show"
      className="mx-auto max-w-3xl px-2 pb-8 pt-14 text-center md:pb-12 md:pt-24"
    >
      <motion.span
        variants={fadeUp}
        className="inline-block rounded-full bg-neifert/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-neifert"
      >
        {home.heroBadge}
      </motion.span>
      <motion.h1
        variants={fadeUp}
        className="mt-6 font-display text-4xl font-extrabold leading-[1.1] text-ink md:text-6xl"
      >
        {home.heroTitleA} <em className="not-italic text-neifert">{home.heroTitleEm}</em>{' '}
        {home.heroTitleB}
      </motion.h1>
      <motion.p
        variants={fadeUp}
        className="mx-auto mt-5 max-w-xl text-ink-2 md:text-lg"
      >
        {home.heroSubtitle}
      </motion.p>
    </motion.section>
  )
}
