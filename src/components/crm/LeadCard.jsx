import { Link } from 'react-router-dom'
import { Phone, ChevronRight } from 'lucide-react'
import { WhatsAppIcon } from '@/components/common/SocialIcons'
import GlassCard from '@/components/common/GlassCard'
import { LEAD_STATUSES, WHATSAPP_PHONE } from '@/lib/constants'
import { formatRelative } from '@/lib/formatters'
import { cn } from '@/lib/cn'
import { leadFollowUpMessage } from '@/lib/whatsapp'

function Avatar({ lead }) {
  return (
    <div className="relative shrink-0">
      {lead.avatar_url ? (
        <img src={lead.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
      ) : (
        <span className="grid h-12 w-12 place-items-center rounded-full bg-neifert/15 text-sm font-bold text-neifert">
          {lead.full_name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-bg bg-success" />
    </div>
  )
}

export default function LeadCard({ lead }) {
  const waHref = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(
    leadFollowUpMessage(lead)
  )}`
  const status = LEAD_STATUSES[lead.status]

  return (
    <GlassCard className="p-4">
      <div className="flex items-start gap-3">
        <Avatar lead={lead} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-bold text-ink">{lead.full_name}</p>
            <span className="shrink-0 text-xs text-ink-3">
              {formatRelative(lead.last_contact_at)}
            </span>
          </div>
          <p className="truncate text-sm font-semibold text-neifert">
            {lead.vehicle_interest}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="rounded-full border border-neifert px-2 py-0.5 text-[11px] font-semibold text-neifert">
              {lead.source}
            </span>
            <span className="text-xs text-ink-3">{status?.label}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <a
          href={`tel:${lead.phone}`}
          aria-label="Llamar"
          className="grid h-10 w-10 place-items-center rounded-full text-ink-2 transition-colors hover:text-neifert"
          style={{ border: '1px solid var(--c-line)' }}
        >
          <Phone size={17} />
        </a>
        <a
          href={waHref}
          target="_blank"
          rel="noreferrer"
          aria-label="Mensaje"
          className="grid h-10 w-10 place-items-center rounded-full bg-success/15 text-success transition-colors hover:bg-success/25"
        >
          <WhatsAppIcon size={17} />
        </a>
        <Link
          to={`/admin/crm/${lead.id}`}
          className={cn(
            'glass flex flex-1 items-center justify-center gap-1 rounded-full py-2.5 text-sm font-semibold text-ink transition-colors hover:text-neifert'
          )}
        >
          Ver Perfil <ChevronRight size={15} />
        </Link>
      </div>
    </GlassCard>
  )
}
