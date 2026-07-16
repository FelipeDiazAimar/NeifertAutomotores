import { motion } from 'framer-motion'
import { WhatsAppIcon } from '@/components/common/SocialIcons'
import { waLink } from '@/lib/whatsapp'
import { trackEvent } from '@/services/events.service'
import { detectSource } from '@/lib/provenance'
import { useSiteStore } from '@/store/useSiteStore'

/** Botón flotante de WhatsApp. Sobre el tab-bar en mobile. */
export default function WhatsAppFab({
  message = 'Hola! Quería consultar por un vehículo de Neifert Automotores.',
}) {
  const phone = useSiteStore((s) => s.socials.whatsappPhone)
  const href = waLink(phone, message)
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={() => trackEvent(null, 'consulta', detectSource())}
      aria-label="Contactar por WhatsApp"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.6, type: 'spring', stiffness: 260, damping: 18 }}
      whileHover={{ scale: 1.1, rotate: -6 }}
      whileTap={{ scale: 0.95 }}
      className="fixed bottom-24 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-whatsapp text-white md:bottom-8 md:right-8"
      style={{ boxShadow: '0 14px 32px -8px rgba(37,211,102,0.6)' }}
    >
      <WhatsAppIcon size={26} />
    </motion.a>
  )
}
