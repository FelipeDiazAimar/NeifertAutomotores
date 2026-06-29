import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import Button from '@/components/common/Button'
import { useScrollReveal } from '@/hooks/useScrollReveal'
import { useSiteStore } from '@/store/useSiteStore'

export default function StoryCTA() {
  const home = useSiteStore((s) => s.home)

  return (
    <motion.section
      {...useScrollReveal()}
      className="relative my-12 overflow-hidden rounded-[28px] shadow-glass"
    >
      <img
        src={home.ctaImage}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-black/65" />
      <div className="relative z-10 mx-auto max-w-2xl px-6 py-20 text-center">
        <h2 className="font-display text-3xl font-extrabold leading-tight text-white md:text-4xl">
          {home.ctaTitleA}{' '}
          <em className="not-italic text-neifert">{home.ctaTitleEm}</em>
          {home.ctaTitleB}
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-white/80">{home.ctaSubtitle}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/catalogo">
            <Button size="lg" iconRight={ArrowRight}>
              Ver Inventario
            </Button>
          </Link>
          <Link to="/cita">
            <Button size="lg" variant="glass" className="text-white">
              Solicitar Cita
            </Button>
          </Link>
        </div>
      </div>
    </motion.section>
  )
}
