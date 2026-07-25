import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { WhatsAppIcon } from '@/components/common/SocialIcons'
import { GENERAL_INQUIRY_MESSAGE, waLink } from '@/lib/whatsapp'
import { trackEvent } from '@/services/events.service'
import { detectSource } from '@/lib/provenance'
import { useSiteStore } from '@/store/useSiteStore'

const POSITION_KEY = 'nf-whatsapp-fab-pos'
// Por debajo de este desplazamiento (px) un gesto se toma como toque, no
// arrastre — evita que un tap con la mano temblando dispare drag por error.
const DRAG_THRESHOLD = 6

function loadPosition() {
  try {
    const raw = localStorage.getItem(POSITION_KEY)
    if (!raw) return { x: 0, y: 0 }
    const parsed = JSON.parse(raw)
    return { x: Number(parsed.x) || 0, y: Number(parsed.y) || 0 }
  } catch {
    return { x: 0, y: 0 }
  }
}

function savePosition(pos) {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(pos))
  } catch {
    // localStorage lleno/bloqueado (modo privado) — no persiste, no rompe.
  }
}

/** Botón flotante de WhatsApp. Se puede arrastrar a cualquier posición de la
 *  pantalla; la posición queda guardada en localStorage y se recuerda entre
 *  visitas. El offset (x, y) es relativo a su posición CSS por defecto
 *  (bottom-24 right-5 / md:bottom-8 md:right-8). */
export default function WhatsAppFab({ message = GENERAL_INQUIRY_MESSAGE }) {
  const phone = useSiteStore((s) => s.socials.whatsappPhone)
  const href = waLink(phone, message)
  const [pos, setPos] = useState(loadPosition)
  const draggedRef = useRef(false)
  const constraintsRef = useRef(null)

  return (
    <>
      {/* Límites de arrastre: toda la ventana. Invisible y sin interceptar clicks. */}
      <div ref={constraintsRef} className="pointer-events-none fixed inset-0 z-0" />
      <motion.a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => {
          if (draggedRef.current) {
            e.preventDefault()
            return
          }
          trackEvent(null, 'consulta', detectSource())
        }}
        aria-label="Contactar por WhatsApp — mantené presionado para moverlo"
        drag
        dragMomentum={false}
        dragElastic={0.05}
        dragConstraints={constraintsRef}
        onDragStart={() => {
          draggedRef.current = false
        }}
        onDrag={(_e, info) => {
          if (Math.abs(info.offset.x) > DRAG_THRESHOLD || Math.abs(info.offset.y) > DRAG_THRESHOLD) {
            draggedRef.current = true
          }
        }}
        onDragEnd={(_e, info) => {
          const next = { x: pos.x + info.offset.x, y: pos.y + info.offset.y }
          setPos(next)
          savePosition(next)
          // El click sintético que sigue al soltar ya fue frenado por el
          // check de arriba; libera el flag para que el próximo toque
          // normal (sin arrastre) navegue como siempre.
          setTimeout(() => {
            draggedRef.current = false
          }, 0)
        }}
        initial={{ scale: 0, opacity: 0, x: pos.x, y: pos.y }}
        animate={{ scale: 1, opacity: 1, x: pos.x, y: pos.y }}
        transition={{ delay: 0.6, type: 'spring', stiffness: 260, damping: 18 }}
        whileHover={{ scale: 1.1, rotate: -6 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-24 right-5 z-40 grid h-14 w-14 cursor-grab touch-none place-items-center rounded-full bg-whatsapp text-white active:cursor-grabbing md:bottom-8 md:right-8"
        style={{ boxShadow: '0 14px 32px -8px rgba(37,211,102,0.6)' }}
      >
        <WhatsAppIcon size={26} />
      </motion.a>
    </>
  )
}
