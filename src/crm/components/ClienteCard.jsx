import { useNavigate } from 'react-router-dom'
import Badge from '@/components/common/Badge'
import GlassCard from '@/components/common/GlassCard'
import { lineaInteres, statusVariant, canalLabel } from '@/crm/lib/formatCliente'

export default function ClienteCard({ cliente: c }) {
  const navigate = useNavigate()
  return (
    <GlassCard as="button" onClick={() => navigate(`/crm/clientes/${c.id}`)} className="w-full space-y-1 p-3 text-left">
      <div className="flex items-start justify-between gap-2">
        <p className="truncate font-semibold text-ink">{c.nombre}</p>
        <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
      </div>
      <p className="text-xs text-ink-3">{c.telefono || 'sin teléfono'} · {canalLabel(c.canal)}</p>
      <p className="truncate text-xs text-ink-2">{lineaInteres(c)}</p>
    </GlassCard>
  )
}
