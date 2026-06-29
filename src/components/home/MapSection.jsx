import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Map } from 'lucide-react'
import { useSiteStore } from '@/store/useSiteStore'

const MAPS_URL =
  'https://www.google.com/maps/search/?api=1&query=Av.+Urquiza+898+San+Francisco+C%C3%B3rdoba+Argentina'

export default function MapSection() {
  const [active, setActive] = useState(false)
  const socials = useSiteStore((s) => s.socials)
  const address = socials.address || 'Av. Urquiza 898, San Francisco, Córdoba'

  return (
    <section className="mt-20 mb-4">
      {/* Encabezado */}
      <div className="mb-6 flex flex-col items-center gap-1 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-neifert/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-neifert">
          <MapPin size={13} /> Encontranos
        </span>
        <p className="mt-3 font-display text-2xl font-extrabold text-ink md:text-3xl">
          Visitanos en el salón
        </p>
        <p className="text-sm text-ink-3">{address}</p>
      </div>

      {/* Contenedor del mapa */}
      <div className="relative h-[380px] overflow-hidden rounded-[24px] md:h-[460px]">
        {/* Iframe — pointer events controlados por estado */}
        <iframe
          title="Neifert Automotores — Ubicación"
          src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3381.0!2d-62.0878!3d-31.4271!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2sAv.+Urquiza+898%2C+San+Francisco%2C+C%C3%B3rdoba!5e0!3m2!1ses!2sar!4v1"
          width="100%"
          height="100%"
          style={{
            border: 0,
            display: 'block',
            pointerEvents: active ? 'auto' : 'none',
          }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />

        {/* Overlay con blur — desaparece al activar */}
        <AnimatePresence>
          {!active && (
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.35 } }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-4 backdrop-blur-[3px] bg-bg/30"
            >
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setActive(true)}
                className="flex items-center gap-2.5 rounded-full bg-neifert px-6 py-3 text-sm font-bold text-white shadow-glow-red"
              >
                <Map size={16} />
                Ver mapa
              </motion.button>
              <p className="text-xs text-ink-3">Hacé clic para interactuar con el mapa</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Botón para volver a bloquear — aparece cuando está activo */}
        <AnimatePresence>
          {active && (
            <motion.button
              key="lock"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              onClick={() => setActive(false)}
              className="absolute bottom-4 right-4 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-md"
            >
              Salir del mapa
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Link externo */}
      <div className="mt-3 text-center">
        <a
          href={MAPS_URL}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-ink-3 underline-offset-2 hover:text-neifert hover:underline transition-colors"
        >
          Abrir en Google Maps →
        </a>
      </div>
    </section>
  )
}
