import { useNavigate } from 'react-router-dom'
import { Car } from 'lucide-react'
import LeadStatusBadge from './LeadStatusBadge'
import { formatDateTime } from '@/lib/formatters'

const HEADERS = ['Cliente', 'Interés', 'Origen', 'Estado', 'Último contacto']

export default function LeadTable({ leads }) {
  const navigate = useNavigate()

  return (
    <div className="glass overflow-hidden rounded-[20px] shadow-glass">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            {HEADERS.map((h) => (
              <th
                key={h}
                className="px-5 py-4 text-[11px] font-semibold uppercase tracking-wide text-ink-3"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr
              key={lead.id}
              onClick={() => navigate(`/admin/crm/${lead.id}`)}
              className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface"
            >
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  {lead.avatar_url ? (
                    <img
                      src={lead.avatar_url}
                      alt=""
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-neifert/15 text-xs font-bold text-neifert">
                      {lead.full_name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div>
                    <p className="font-semibold text-ink">{lead.full_name}</p>
                    <p className="text-xs text-ink-3">
                      ID: #{lead.id.slice(-6).toUpperCase()}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5">
                <span className="flex items-center gap-2 text-ink-2">
                  <Car size={15} className="text-ink-3" />
                  {lead.vehicle_interest}
                </span>
              </td>
              <td className="px-5 py-3.5 text-ink-2">{lead.source}</td>
              <td className="px-5 py-3.5">
                <LeadStatusBadge status={lead.status} />
              </td>
              <td className="px-5 py-3.5 text-ink-2">
                {formatDateTime(lead.last_contact_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
