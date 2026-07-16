import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Gauge, Fuel, Settings2, Share2 } from 'lucide-react'
import { WhatsAppIcon } from '@/components/common/SocialIcons'
import { formatVehiclePrice, formatKm } from '@/lib/formatters'
import { vehicleWaLink } from '@/lib/whatsapp'
import { shareOrCopy } from '@/lib/share'
import { trackShareClick } from '@/lib/vehicleClicks'
import { trackEvent } from '@/services/events.service'
import { detectSource } from '@/lib/provenance'
import { useSiteStore } from '@/store/useSiteStore'
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

/** Imagen de la card que rota a otra foto del mismo vehículo al hacer hover. */
function CardImage({ vehicle, rounded }) {
  const all = (vehicle.images?.length ? vehicle.images : [vehicle.main_image_url]).filter(
    Boolean
  )
  const [idx, setIdx] = useState(0)
  const [failed, setFailed] = useState(false)
  const timer = useRef(null)

  const startCycle = () => {
    if (all.length < 2) return
    timer.current = setInterval(() => setIdx((i) => (i + 1) % all.length), 900)
  }
  const stopCycle = () => {
    clearInterval(timer.current)
    setIdx(0)
  }
  useEffect(() => () => clearInterval(timer.current), [])

  if (failed || all.length === 0) return <ImgPlaceholder brand={vehicle.brand} />

  return (
    <div
      className={cn('absolute inset-0', rounded)}
      onMouseEnter={startCycle}
      onMouseLeave={stopCycle}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.img
          key={idx}
          src={all[idx]}
          alt={`${vehicle.brand} ${vehicle.model}`}
          loading="lazy"
          onError={() => setFailed(true)}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </AnimatePresence>
      {all.length > 1 && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
          {all.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === idx ? 'w-4 bg-neifert' : 'w-1.5 bg-white/60'
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
    <span className="flex items-center gap-1.5 text-xs text-ink-2">
      <Icon size={14} className="text-ink-3" />
      {children}
    </span>
  )
}

export default function VehicleCard({ vehicle, view = 'grid' }) {
  const phone = useSiteStore((s) => s.socials.whatsappPhone)
  const waHref = vehicleWaLink(phone, vehicle)

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
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-whatsapp text-white"
      style={{ boxShadow: '0 8px 18px -6px rgba(37,211,102,0.6)' }}
    >
      <WhatsAppIcon size={20} />
    </motion.a>
  )

  const shareButton = (
    <motion.button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        trackShareClick({ kind: 'vehicle', id: vehicle.id })
        trackEvent(vehicle.id, 'compartir', detectSource())
        shareOrCopy({
          url: `/catalogo/${vehicle.id}?ref=share`,
          title: `${vehicle.brand} ${vehicle.model} — Neifert Automotores`,
          text: `Mirá este ${vehicle.brand} ${vehicle.model} ${vehicle.year} en Neifert.`,
        })
      }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      aria-label="Compartir"
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full glass text-ink transition-colors hover:text-neifert"
    >
      <Share2 size={18} />
    </motion.button>
  )

  const actions = (
    <div className="flex items-center gap-2">
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
        className="group glass flex gap-4 overflow-hidden rounded-[20px] p-3 shadow-glass"
      >
        <Link
          to={`/catalogo/${vehicle.id}`}
          className="relative h-28 w-44 shrink-0 overflow-hidden rounded-2xl"
        >
          <CardImage vehicle={vehicle} />
          <span className="absolute left-2 top-2 z-10 rounded-full bg-white/85 px-2.5 py-0.5 text-xs font-semibold text-[#0b0b0f]">
            {vehicle.year}
          </span>
        </Link>
        <div className="flex flex-1 flex-col justify-between py-1">
          <Link to={`/catalogo/${vehicle.id}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-neifert">
              {vehicle.brand}
            </p>
            <p className="truncate font-display text-lg font-bold text-ink">
              {vehicle.model}
              {vehicle.version && <span className="text-ink-2"> {vehicle.version}</span>}
            </p>
          </Link>
          {specs}
        </div>
        <div className="flex flex-col items-end justify-between py-1">
          <p className="font-display text-xl font-extrabold text-ink">
            {formatVehiclePrice(vehicle)}
          </p>
          {actions}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      {...layoutProps}
      whileHover={{ y: -8 }}
      className="group glass overflow-hidden rounded-[20px] shadow-glass"
    >
      <Link to={`/catalogo/${vehicle.id}`} className="block">
        <div className="relative aspect-square overflow-hidden">
          <CardImage vehicle={vehicle} />
          <span className="absolute left-3 top-3 z-10 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-[#0b0b0f] backdrop-blur">
            {vehicle.year}
          </span>
          {vehicle.is_premium && (
            <span className="absolute right-3 top-3 z-10 rounded-full bg-neifert px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
              Premium
            </span>
          )}
        </div>
      </Link>
      <div className="p-4">
        <Link to={`/catalogo/${vehicle.id}`} className="block">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neifert">
            {vehicle.brand}
          </p>
          <p className={cn('truncate font-display text-lg font-bold text-ink')}>
            {vehicle.model}
            {vehicle.version && <span className="text-ink-2"> {vehicle.version}</span>}
          </p>
        </Link>
        <div className="mt-3">{specs}</div>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-3">
              Precio contado
            </p>
            <p className="font-display text-xl font-extrabold text-ink">
              {formatVehiclePrice(vehicle)}
            </p>
          </div>
          {actions}
        </div>
      </div>
    </motion.div>
  )
}
