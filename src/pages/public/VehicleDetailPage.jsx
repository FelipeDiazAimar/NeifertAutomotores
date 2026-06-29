import { useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Gauge, Fuel, Settings2, Calendar } from 'lucide-react'
import { WhatsAppIcon } from '@/components/common/SocialIcons'
import { useVehicle } from '@/hooks/useVehicles'
import { formatUSD, formatKm } from '@/lib/formatters'
import { vehicleWaLink } from '@/lib/whatsapp'
import { trackVehicleClick, trackVehicleConversion } from '@/lib/vehicleClicks'
import { useSiteStore } from '@/store/useSiteStore'
import Button from '@/components/common/Button'
import GlassCard from '@/components/common/GlassCard'
import Spinner from '@/components/common/Spinner'
import VehicleGallery from '@/components/catalog/VehicleGallery'
import RelatedVehicles from '@/components/catalog/RelatedVehicles'

function SpecCard({ icon: Icon, label, value }) {
  return (
    <GlassCard className="flex items-center gap-3 p-4">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-neifert/10 text-neifert">
        <Icon size={18} />
      </span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">
          {label}
        </p>
        <p className="font-semibold text-ink">{value}</p>
      </div>
    </GlassCard>
  )
}

export default function VehicleDetailPage() {
  const { id } = useParams()
  const { data: v, isLoading } = useVehicle(id)
  const phone = useSiteStore((s) => s.socials.whatsappPhone)

  useEffect(() => {
    if (id) trackVehicleClick(id)
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
        <Link to="/catalogo" className="mt-4 inline-block">
          <Button variant="glass" icon={ArrowLeft}>
            Volver al catálogo
          </Button>
        </Link>
      </div>
    )
  }

  const waHref = vehicleWaLink(phone, v)
  const gallery = v.images?.length ? v.images : [v.main_image_url]

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <Link
        to="/catalogo"
        className="inline-flex items-center gap-2 text-sm text-ink-2 transition-colors hover:text-neifert"
      >
        <ArrowLeft size={16} /> Volver al catálogo
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <VehicleGallery
            images={gallery}
            alt={`${v.brand} ${v.model}`}
            premium={v.is_premium}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <p className="text-sm font-bold uppercase tracking-wider text-neifert">
            {v.brand}
          </p>
          <h1 className="mt-1 font-display text-4xl font-extrabold text-ink">{v.model}</h1>
          <p className="mt-4 font-display text-3xl font-extrabold text-ink">
            {formatUSD(v.price_usd)}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <SpecCard icon={Calendar} label="Año" value={v.year} />
            <SpecCard icon={Gauge} label="Kilómetros" value={formatKm(v.km)} />
            <SpecCard icon={Fuel} label="Combustible" value={v.fuel_type} />
            <SpecCard icon={Settings2} label="Transmisión" value={v.transmission || '—'} />
          </div>

          {v.description && <p className="mt-6 text-ink-2">{v.description}</p>}

          <div className="mt-8 flex flex-wrap gap-3">
            <a href={waHref} target="_blank" rel="noreferrer" onClick={() => trackVehicleConversion(id)}>
              <Button variant="whatsapp" size="lg" icon={WhatsAppIcon}>
                Consultar por WhatsApp
              </Button>
            </a>
            <Button variant="glass" size="lg">
              Solicitar Cita
            </Button>
          </div>
        </motion.div>
      </div>

      <RelatedVehicles current={v} />
    </section>
  )
}
