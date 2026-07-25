import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Gauge, Fuel, Settings2, Share2 } from 'lucide-react'
import { WhatsAppIcon } from '@/components/common/SocialIcons'
import { formatVehiclePrice, formatKm } from '@/lib/formatters'
import { vehicleWaLink } from '@/lib/whatsapp'
import { shareOrCopy } from '@/lib/share'
import { trackShareClick } from '@/lib/vehicleClicks'
import { trackEvent } from '@/services/events.service'
import { detectSource } from '@/lib/provenance'
import { useSiteStore } from '@/store/useSiteStore'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { EASE } from '@/lib/animations'
import { cn } from '@/lib/cn'

function ImgPlaceholder({ brand }) {
  return (
    <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[#2a2a30] to-[#0b0b0f]">
      <span className="font-display text-lg font-bold uppercase tracking-widest text-white/25">
        {brand}
      </span>
    </div>
  )
}

/** Imagen de la card. En desktop, el carrusel solo avanza automáticamente
 *  mientras el mouse está sobre esa card puntual (y vuelve a la primera al
 *  salir). En mobile, sigue avanzando sola cuando la card está en vista y
 *  se puede navegar con swipe. */
function CardImage({ vehicle, rounded, isHovered }) {
  const all = (vehicle.images?.length ? vehicle.images : [vehicle.main_image_url]).filter(
    Boolean
  )
  const isDesktop = useIsDesktop()
  const cardRef = useRef(null)
  const touchRef = useRef(null)
  const [idx, setIdx] = useState(0)
  const [failed, setFailed] = useState(false)
  const [paused, setPaused] = useState(false)
  const [inView, setInView] = useState(true)
  // Fotos 4:3 (cargadas así desde el admin) no llenan un marco cuadrado sin
  // recortar contenido: se muestran con letterbox (barras negras) en vez de
  // recortarlas, así se ve la foto completa igual que en las cuadradas 1:1.
  const [wideImages, setWideImages] = useState({})

  // Volver a la primera imagen al salir el mouse (solo desktop, sin pausa manual)
  useEffect(() => {
    if (!isHovered && !paused) setIdx(0)
  }, [isHovered, paused])

  // Solo la card centrada/principalmente visible reproduce el carrusel (mobile)
  useEffect(() => {
    const el = cardRef.current
    if (!el || all.length < 2) return
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.5 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [all.length])

  // Autoplay: en desktop, solo con hover sobre la card; en mobile, en vista.
  useEffect(() => {
    if (paused || all.length < 2) return undefined
    const shouldPlay = isDesktop ? isHovered : inView
    if (!shouldPlay) return undefined
    const timer = setInterval(() => setIdx((i) => (i + 1) % all.length), 2500)
    return () => clearInterval(timer)
  }, [all.length, paused, inView, isDesktop, isHovered])

  const go = (direction, event) => {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    setPaused(true)
    setIdx((i) => (i + direction + all.length) % all.length)
  }

  const onTouchStart = (e) => {
    touchRef.current = e.touches[0].clientX
  }
  const onTouchEnd = (e) => {
    const start = touchRef.current
    touchRef.current = null
    if (start == null || all.length < 2) return
    const end = e.changedTouches[0].clientX
    const delta = end - start
    if (Math.abs(delta) > 50) {
      e.preventDefault()
      go(delta > 0 ? -1 : 1)
    }
  }

  if (failed || all.length === 0) return <ImgPlaceholder brand={vehicle.brand} />

  return (
    <div
      ref={cardRef}
      className={cn('absolute inset-0', rounded)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.img
          key={idx}
          src={all[idx]}
          alt={`${vehicle.brand} ${vehicle.model}`}
          loading="lazy"
          onError={() => setFailed(true)}
          onLoad={(e) => {
            const img = e.currentTarget
            const wide = img.naturalWidth / img.naturalHeight > 1.15
            setWideImages((prev) => (prev[all[idx]] === wide ? prev : { ...prev, [all[idx]]: wide }))
          }}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className={cn(
            'pointer-events-none absolute inset-0 h-full w-full',
            wideImages[all[idx]] ? 'bg-black object-contain' : 'object-cover'
          )}
        />
      </AnimatePresence>
      {all.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Ver imagen anterior"
            onClick={(event) => go(-1, event)}
            className="absolute left-1.5 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-white/30 bg-black/35 text-white opacity-70 backdrop-blur-sm transition hover:bg-black/55 sm:grid sm:left-2 sm:h-8 sm:w-8 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
          >
            <ChevronLeft size={16} className="sm:hidden" />
            <ChevronLeft size={18} className="hidden sm:block" />
          </button>
          <button
            type="button"
            aria-label="Ver imagen siguiente"
            onClick={(event) => go(1, event)}
            className="absolute right-1.5 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-white/30 bg-black/35 text-white opacity-70 backdrop-blur-sm transition hover:bg-black/55 sm:grid sm:right-2 sm:h-8 sm:w-8 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
          >
            <ChevronRight size={16} className="sm:hidden" />
            <ChevronRight size={18} className="hidden sm:block" />
          </button>
        </>
      )}
      {all.length > 1 && (
        <div className="pointer-events-none absolute bottom-1.5 left-1/2 flex -translate-x-1/2 gap-1 sm:bottom-2">
          {all.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1 rounded-full transition-all sm:h-1.5',
                i === idx ? 'w-3 bg-neifert sm:w-4' : 'w-1 bg-white/60 sm:w-1.5'
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Spec({ icon: Icon, children }) {
  return (
    <span className="flex items-center gap-1 text-[11px] text-ink-2 sm:gap-1.5 sm:text-xs">
      <Icon size={13} className="shrink-0 text-ink-3" />
      {children}
    </span>
  )
}

export default function VehicleCard({ vehicle, view = 'grid' }) {
  const phone = useSiteStore((s) => s.socials.whatsappPhone)
  const waHref = vehicleWaLink(phone, vehicle)
  const [isCardHovered, setIsCardHovered] = useState(false)

  const specs = (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      <Spec icon={Gauge}>{formatKm(vehicle.km)}</Spec>
      <Spec icon={Fuel}>{vehicle.fuel_type}</Spec>
      {vehicle.transmission && <Spec icon={Settings2}>{vehicle.transmission}</Spec>}
    </div>
  )

  const waButton = (
    <motion.a
      href={waHref}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        e.stopPropagation()
        trackEvent(vehicle.id, 'consulta', detectSource())
      }}
      whileHover={{ scale: 1.1, rotate: -6 }}
      whileTap={{ scale: 0.95 }}
      aria-label="Consultar por WhatsApp"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-whatsapp text-white sm:h-11 sm:w-11"
      style={{ boxShadow: '0 8px 18px -6px rgba(37,211,102,0.6)' }}
    >
      <WhatsAppIcon size={16} className="sm:hidden" />
      <WhatsAppIcon size={20} className="hidden shrink-0 sm:block" />
    </motion.a>
  )

  const onShareClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    trackShareClick({ kind: 'vehicle', id: vehicle.id })
    trackEvent(vehicle.id, 'compartir', detectSource())
    shareOrCopy({
      url: `/catalogo/${vehicle.id}?ref=share`,
      title: `${vehicle.brand} ${vehicle.model} — Neifert Automotores`,
      text: `Mirá este ${vehicle.brand} ${vehicle.model} ${vehicle.year} en Neifert.`,
    })
  }

  // Desktop (sm+, sin cambios): botón de compartir junto al de WhatsApp, en
  // la fila del precio. En mobile no se renderiza acá — se muestra flotando
  // sobre la foto (shareButtonOverlay) para dejar la fila del precio solo
  // con el precio + WhatsApp.
  const shareButton = (
    <motion.button
      type="button"
      onClick={onShareClick}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      aria-label="Compartir"
      className="hidden shrink-0 place-items-center rounded-full glass text-ink transition-colors hover:text-neifert sm:grid sm:h-11 sm:w-11"
    >
      <Share2 size={18} />
    </motion.button>
  )

  // Solo mobile: badge flotante sobre la esquina superior derecha de la foto
  // (vista grid — la cuadrícula de 2 columnas queda muy justa de ancho).
  const shareButtonOverlay = (
    <motion.button
      type="button"
      onClick={onShareClick}
      whileTap={{ scale: 0.9 }}
      aria-label="Compartir"
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full glass text-ink transition-colors hover:text-neifert sm:hidden"
    >
      <Share2 size={13} />
    </motion.button>
  )

  // Vista lista: la card ocupa el ancho completo incluso en mobile, así que
  // compartir siempre entra al lado de WhatsApp (no hace falta esconderlo).
  const shareButtonList = (
    <motion.button
      type="button"
      onClick={onShareClick}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      aria-label="Compartir"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full glass text-ink transition-colors hover:text-neifert sm:h-11 sm:w-11"
    >
      <Share2 size={15} className="sm:hidden" />
      <Share2 size={18} className="hidden sm:block" />
    </motion.button>
  )

  const actions = (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {shareButton}
      {waButton}
    </div>
  )

  const layoutProps = {
    layout: true,
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.96 },
    transition: { duration: 0.4, ease: EASE },
  }

  if (view === 'list') {
    return (
      <motion.div
        {...layoutProps}
        onMouseEnter={() => setIsCardHovered(true)}
        onMouseLeave={() => setIsCardHovered(false)}
        className="group glass flex flex-col gap-3 overflow-hidden rounded-[20px] p-2.5 shadow-glass sm:flex-row sm:gap-4 sm:p-3"
      >
        <Link
          to={`/catalogo/${vehicle.id}`}
          className="relative h-36 w-full shrink-0 overflow-hidden rounded-2xl sm:h-28 sm:w-44"
        >
          <CardImage vehicle={vehicle} isHovered={isCardHovered} />
          <span className="absolute left-2 top-2 z-10 rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-semibold text-[#0b0b0f] sm:px-2.5 sm:text-xs">
            {vehicle.year}
          </span>
        </Link>
        <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
          <Link to={`/catalogo/${vehicle.id}`}>
            <p className="text-[9px] font-bold uppercase tracking-wider text-neifert sm:text-[10px]">
              {vehicle.brand}
            </p>
            <p className="truncate font-display text-base font-bold text-ink sm:text-lg">
              {vehicle.model}
              {vehicle.version && <span className="text-ink-2"> {vehicle.version}</span>}
            </p>
          </Link>
          {specs}
        </div>
        <div className="flex flex-row items-end justify-between gap-3 py-1 sm:flex-col sm:gap-0">
          <p className="font-display text-lg font-extrabold text-ink sm:text-xl">
            {formatVehiclePrice(vehicle)}
          </p>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {shareButtonList}
            {waButton}
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      {...layoutProps}
      whileHover={{ y: -8 }}
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
      className="group glass overflow-hidden rounded-[20px] shadow-glass"
    >
      <Link to={`/catalogo/${vehicle.id}`} className="block">
        <div className="relative aspect-square overflow-hidden">
          <CardImage vehicle={vehicle} isHovered={isCardHovered} />
          <span className="absolute left-2 top-2 z-10 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-[#0b0b0f] backdrop-blur sm:left-3 sm:top-3 sm:px-3 sm:py-1 sm:text-xs">
            {vehicle.year}
          </span>
          {/* Esquina superior derecha: en desktop, "Nuevo" (si aplica) —
              sin cambios. En mobile, solo el botón de compartir; "Nuevo" se
              muestra más abajo, a la altura de la marca (ver debajo). */}
          <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5 sm:right-3 sm:top-3">
            {vehicle.is_new && (
              <span className="hidden rounded-full bg-neifert px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white sm:inline-block">
                Nuevo
              </span>
            )}
            {shareButtonOverlay}
          </div>
        </div>
      </Link>
      <div className="p-2.5 sm:p-4">
        <Link to={`/catalogo/${vehicle.id}`} className="block">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] font-bold uppercase tracking-wider text-neifert sm:text-[10px]">
              {vehicle.brand}
            </p>
            {vehicle.is_new && (
              <span className="rounded-full bg-neifert px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white sm:hidden">
                Nuevo
              </span>
            )}
          </div>
          <p className={cn('truncate font-display text-sm font-bold text-ink sm:text-lg')}>
            {vehicle.model}
            {vehicle.version && <span className="text-ink-2"> {vehicle.version}</span>}
          </p>
        </Link>
        <div className="mt-1.5 sm:mt-3">{specs}</div>
        <div className="mt-2.5 flex items-center justify-between gap-2 sm:mt-4 sm:flex-wrap sm:items-end">
          <div>
            <p className="hidden text-[9px] font-semibold uppercase tracking-wide text-ink-3 sm:block">
              Precio contado
            </p>
            <p className="font-display text-sm font-extrabold text-ink sm:text-xl">
              {formatVehiclePrice(vehicle)}
            </p>
          </div>
          {actions}
        </div>
      </div>
    </motion.div>
  )
}
