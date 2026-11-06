import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Gauge,
  Fuel,
  Settings2,
  Calendar,
  Share2,
  AlertCircle,
} from 'lucide-react'
import { WhatsAppIcon } from '@/components/common/SocialIcons'
import { useVehicle } from '@/hooks/useVehicles'
import { formatKm } from '@/lib/formatters'
import { similarVehicleMessage, vehicleWaLink } from '@/lib/whatsapp'
import {
  trackVehicleClick,
  trackVehicleConversion,
  trackShareClick,
} from '@/lib/vehicleClicks'
import { trackEvent } from '@/services/events.service'
import { detectSource } from '@/lib/provenance'
import { esNuevoVigente } from '@/crm/lib/formatVehiculo'
import { shareOrCopy } from '@/lib/share'
import { useSiteStore } from '@/store/useSiteStore'
import { useIsLarge } from '@/hooks/useMediaQuery'
import { EASE } from '@/lib/animations'
import Button from '@/components/common/Button'
import GlassCard from '@/components/common/GlassCard'
import Spinner from '@/components/common/Spinner'
import VehicleGallery from '@/components/catalog/VehicleGallery'
import RelatedVehicles from '@/components/catalog/RelatedVehicles'
import SoldRibbon from '@/components/catalog/SoldRibbon'

const STATUS_LABEL = { reservado: 'Reservado', vendido: 'Vendido' }

function SpecCard({ icon: Icon, label, value }) {
  return (
    <GlassCard className="flex items-center gap-3 p-4">
      <span className="bg-neifert/10 text-neifert grid h-10 w-10 place-items-center rounded-xl">
        <Icon size={18} />
      </span>
      <div>
        <p className="text-ink-3 text-[10px] font-semibold tracking-wide uppercase">
          {label}
        </p>
        <p className="text-ink font-semibold">{value}</p>
      </div>
    </GlassCard>
  )
}

export default function VehicleDetailPage({ variant = 'usados' }) {
  const { id } = useParams()
  const { data: v, isLoading } = useVehicle(id)
  // Base de la sección de origen: /catalogo (usados) o /catalogo-0km.
  const basePath = variant === 'cero' ? '/catalogo-0km' : '/catalogo'
  const condition = variant === 'cero' ? 'cero' : 'usados'
  const phone = useSiteStore((s) => s.socials.whatsappPhone)
  const sourceRef = useRef('Directo')
  const isLarge = useIsLarge()
  const [galleryWide, setGalleryWide] = useState(false)

  useEffect(() => {
    if (id) {
      sourceRef.current = detectSource()
      trackVehicleClick(id, sourceRef.current)
      trackEvent(id, 'vista', sourceRef.current)
    }
  }, [id])

  if (isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner size={32} />
      </div>
    )
  }

  if (!v) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <p className="text-ink-2">No encontramos esta unidad.</p>
        <Link to={basePath} className="mt-4 inline-block">
          <Button variant="glass" icon={ArrowLeft}>
            Volver al catálogo
          </Button>
        </Link>
      </div>
    )
  }

  const available = (v.status || 'disponible') === 'disponible'
  const statusLabel = STATUS_LABEL[v.status] || 'No disponible'
  const gallery = v.images?.length ? v.images : [v.main_image_url]

  const waMessage = available ? undefined : similarVehicleMessage(v, statusLabel)
  const waHref = vehicleWaLink(phone, v, waMessage)

  const onShare = () => {
    trackShareClick({ kind: 'vehicle', id: v.id, source: sourceRef.current })
    trackEvent(v.id, 'compartir', sourceRef.current)
    shareOrCopy({
      url: `${basePath}/${v.id}?ref=share`,
      title: `${v.brand} ${v.model} — Neifert Automotores`,
      text: `Mirá este ${v.brand} ${v.model} ${v.year} en Neifert Automotores.`,
    })
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <Link
        to={basePath}
        className="text-ink-2 hover:text-neifert inline-flex items-center gap-2 text-sm transition-colors"
      >
        <ArrowLeft size={16} /> Volver al catálogo
      </Link>

      <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-start">
        <motion.div
          initial={{ opacity: 0, scale: 0.97, width: isLarge ? '50%' : '100%' }}
          animate={{
            opacity: 1,
            scale: 1,
            width: isLarge ? (galleryWide ? '58%' : '50%') : '100%',
          }}
          transition={{ duration: 0.5, width: { duration: 0.8, ease: EASE } }}
          className="relative w-full overflow-hidden rounded-[24px] lg:shrink-0"
        >
          <div className={available ? '' : 'opacity-90 grayscale-[35%]'}>
            <VehicleGallery
              images={gallery}
              alt={`${v.brand} ${v.model}`}
              isNew={esNuevoVigente(v)}
              isZeroKm={v.is_zero_km}
              onActiveWideChange={setGalleryWide}
            />
          </div>
          {v.status === 'vendido' && <SoldRibbon large />}
          {v.status === 'reservado' && <SoldRibbon large label="Reservado" tone="gray" />}
          {!available && (
            <span className="bg-ink text-bg shadow-glass absolute top-4 left-4 z-20 rounded-full px-4 py-1.5 text-xs font-bold tracking-wide uppercase">
              {statusLabel}
            </span>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="min-w-0 flex-1"
        >
          <p className="text-neifert text-sm font-bold tracking-wider uppercase">
            {v.brand}
          </p>
          <h1 className="font-display text-ink mt-1 text-4xl font-extrabold">
            {v.model}
            {v.version && <span className="text-ink-2"> {v.version}</span>}
          </h1>
          <p
            className={`font-display mt-4 text-3xl font-extrabold ${
              available ? 'text-ink' : 'text-ink-3'
            }`}
          >
            Consultar
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <SpecCard icon={Calendar} label="Año" value={v.year} />
            <SpecCard icon={Gauge} label="Kilómetros" value={formatKm(v.km)} />
            <SpecCard icon={Fuel} label="Combustible" value={v.fuel_type} />
            <SpecCard
              icon={Settings2}
              label="Transmisión"
              value={v.transmission || '—'}
            />
          </div>

          {v.description && <p className="text-ink-2 mt-6">{v.description}</p>}

          {/* Aviso cuando la unidad ya no está disponible */}
          {!available && (
            <GlassCard className="border-neifert/30 mt-6 flex items-start gap-3 p-4">
              <AlertCircle size={20} className="text-neifert mt-0.5 shrink-0" />
              <div>
                <p className="text-ink font-semibold">
                  Esta unidad ya no está disponible
                </p>
                <p className="text-ink-2 mt-1 text-sm">
                  {v.status === 'vendido' ? 'Se vendió' : 'Está reservada'}. Podemos
                  conseguirte una similar — escribinos o mirá otras opciones abajo.
                </p>
              </div>
            </GlassCard>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                trackVehicleConversion(id, sourceRef.current)
                trackEvent(id, 'consulta', sourceRef.current)
              }}
            >
              <Button variant="whatsapp" size="lg" icon={WhatsAppIcon}>
                {available ? 'Consultar por WhatsApp' : 'Quiero uno similar'}
              </Button>
            </a>

            <Button variant="glass" size="lg" icon={Share2} onClick={onShare}>
              Compartir
            </Button>

            {available && (
              <Link to="/cita">
                <Button variant="glass" size="lg">
                  Solicitar Cita
                </Button>
              </Link>
            )}
          </div>
        </motion.div>
      </div>

      <RelatedVehicles current={v} condition={condition} basePath={basePath} />
    </section>
  )
}
