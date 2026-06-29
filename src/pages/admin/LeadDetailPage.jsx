import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Phone, Mail, Car, Tag, Clock, MessageCircle } from 'lucide-react'
import { useLead } from '@/hooks/useLeads'
import GlassCard from '@/components/common/GlassCard'
import Button from '@/components/common/Button'
import Spinner from '@/components/common/Spinner'
import LeadStatusBadge from '@/components/crm/LeadStatusBadge'
import { formatDateTime } from '@/lib/formatters'
import { WHATSAPP_PHONE } from '@/lib/constants'

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-3 last:border-0">
      <span className="flex items-center gap-2 text-sm text-ink-3">
        <Icon size={16} />
        {label}
      </span>
      <span className="text-sm font-medium text-ink">{value || '—'}</span>
    </div>
  )
}

export default function LeadDetailPage() {
  const { id } = useParams()
  const { data: lead, isLoading } = useLead(id)

  if (isLoading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Spinner size={32} />
      </div>
    )
  }

  if (!lead) {
    return (
      <div className="py-20 text-center">
        <p className="text-ink-2">No encontramos este lead.</p>
        <Link to="/admin/crm" className="mt-4 inline-block">
          <Button variant="glass" icon={ArrowLeft}>
            Volver al CRM
          </Button>
        </Link>
      </div>
    )
  }

  const waHref = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(
    `Hola ${lead.full_name}, te contacto de Neifert Automotores.`
  )}`

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/admin/crm"
        className="inline-flex items-center gap-2 text-sm text-ink-2 transition-colors hover:text-neifert"
      >
        <ArrowLeft size={16} /> Volver al CRM
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mt-6"
      >
        <GlassCard className="p-6 md:p-8">
          <div className="flex items-center gap-4">
            {lead.avatar_url ? (
              <img
                src={lead.avatar_url}
                alt=""
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-full bg-neifert/15 text-lg font-bold text-neifert">
                {lead.full_name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="flex-1">
              <h1 className="font-display text-2xl font-bold text-ink">{lead.full_name}</h1>
              <p className="text-sm text-ink-3">ID: #{lead.id.slice(-6).toUpperCase()}</p>
            </div>
            <LeadStatusBadge status={lead.status} />
          </div>

          <div className="mt-6">
            <Row icon={Phone} label="Teléfono" value={lead.phone} />
            <Row icon={Mail} label="Email" value={lead.email} />
            <Row icon={Car} label="Vehículo de interés" value={lead.vehicle_interest} />
            <Row icon={Tag} label="Origen" value={lead.source} />
            <Row icon={Clock} label="Último contacto" value={formatDateTime(lead.last_contact_at)} />
          </div>

          {lead.notes && (
            <div className="mt-4 rounded-2xl bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Notas</p>
              <p className="mt-1 text-sm text-ink-2">{lead.notes}</p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <a href={`tel:${lead.phone}`}>
              <Button variant="glass" icon={Phone}>
                Llamar
              </Button>
            </a>
            <a href={waHref} target="_blank" rel="noreferrer">
              <Button variant="whatsapp" icon={MessageCircle}>
                WhatsApp
              </Button>
            </a>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  )
}
