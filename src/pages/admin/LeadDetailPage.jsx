import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Phone,
  Mail,
  Car,
  Tag,
  Clock,
  MessageCircle,
  User,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Save,
  X,
} from 'lucide-react'
import { useLead, useUpdateLead, useDeleteLead } from '@/hooks/useLeads'
import GlassCard from '@/components/common/GlassCard'
import Button from '@/components/common/Button'
import Spinner from '@/components/common/Spinner'
import LeadStatusBadge from '@/components/crm/LeadStatusBadge'
import Select from '@/components/common/Select'
import { formatDateTime } from '@/lib/formatters'
import { LEAD_STATUSES, LEAD_SOURCES, WHATSAPP_PHONE } from '@/lib/constants'
import { leadFollowUpMessage } from '@/lib/whatsapp'
import { cn } from '@/lib/cn'

const STATUS_OPTIONS = Object.entries(LEAD_STATUSES).map(([id, { label }]) => ({
  id,
  label,
}))

const SOURCE_OPTIONS = LEAD_SOURCES.map((s) => ({ id: s, label: s }))

function Row({ icon: Icon, label, value, className }) {
  return (
    <div className={cn('flex items-center justify-between border-b border-line py-3 last:border-0', className)}>
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
  const updateLead = useUpdateLead()
  const deleteLead = useDeleteLead()

  const [editing, setEditing] = useState(false)
  const [editStatus, setEditStatus] = useState('')
  const [editSource, setEditSource] = useState('')

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
    leadFollowUpMessage(lead)
  )}`

  const isContacted = lead.status !== 'nuevo'

  const startEdit = () => {
    setEditStatus(lead.status)
    setEditSource(lead.source)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
  }

  const saveEdit = async () => {
    await updateLead.mutateAsync({ id, status: editStatus, source: editSource })
    setEditing(false)
  }

  const handleMarkContacted = async () => {
    await updateLead.mutateAsync({
      id,
      status: 'primer_contacto',
      contact_date: new Date().toISOString().split('T')[0],
    })
  }

  const handleDelete = () => {
    if (confirm('¿Estás seguro de eliminar este lead?')) {
      deleteLead.mutate(id)
    }
  }

  const canSave = editStatus !== lead.status || editSource !== lead.source

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
            {!editing ? (
              <LeadStatusBadge status={lead.status} />
            ) : (
              <div className="w-44">
                <Select
                  size="sm"
                  options={STATUS_OPTIONS}
                  value={editStatus}
                  onChange={setEditStatus}
                />
              </div>
            )}
          </div>

          {!isContacted && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-amber/10 p-4">
              <XCircle size={18} className="shrink-0 text-amber" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber">Sin contactar</p>
                <p className="text-xs text-ink-3">Este lead todavía no fue contactado.</p>
              </div>
              <Button
                size="sm"
                variant="glass"
                icon={CheckCircle2}
                onClick={handleMarkContacted}
                disabled={updateLead.isPending}
              >
                Marcar contactado
              </Button>
            </div>
          )}

          {isContacted && (
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-success/10 px-4 py-2.5">
              <CheckCircle2 size={16} className="shrink-0 text-success" />
              <span className="text-sm font-medium text-success">Lead contactado</span>
            </div>
          )}

          <div className="mt-6">
            <Row icon={Phone} label="Teléfono" value={lead.phone} />
            <Row icon={Mail} label="Email" value={lead.email} />
            <Row icon={Car} label="Vehículo de interés" value={lead.vehicle_interest} />
            {editing ? (
              <div className="flex items-center justify-between border-b border-line py-3 last:border-0">
                <span className="flex items-center gap-2 text-sm text-ink-3">
                  <Tag size={16} />
                  Origen
                </span>
                <div className="w-40">
                  <Select
                    size="sm"
                    options={SOURCE_OPTIONS}
                    value={editSource}
                    onChange={setEditSource}
                  />
                </div>
              </div>
            ) : (
              <Row icon={Tag} label="Origen" value={lead.source} />
            )}
            <Row icon={Clock} label="Último contacto" value={formatDateTime(lead.last_contact_at)} />
            {lead.contact_date && (
              <Row icon={User} label="Fecha de contacto" value={lead.contact_date} />
            )}
          </div>

          {lead.notes && (
            <div className="mt-4 rounded-2xl bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Notas</p>
              <p className="mt-1 text-sm text-ink-2">{lead.notes}</p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {editing ? (
              <>
                <Button variant="glass" icon={X} onClick={cancelEdit}>
                  Cancelar
                </Button>
                <Button variant="glass" icon={Save} onClick={saveEdit} disabled={!canSave || updateLead.isPending}>
                  {updateLead.isPending ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              </>
            ) : (
              <>
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
                <Button variant="glass" icon={Pencil} onClick={startEdit}>
                  Editar
                </Button>
                <Button variant="glass" icon={Trash2} onClick={handleDelete} disabled={deleteLead.isPending}>
                  {deleteLead.isPending ? 'Eliminando…' : 'Eliminar'}
                </Button>
              </>
            )}
          </div>
        </GlassCard>
      </motion.div>
    </div>
  )
}
