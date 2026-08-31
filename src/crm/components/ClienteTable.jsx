import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import Badge from '@/components/common/Badge'
import { lineaInteres, statusVariant, canalLabel } from '@/crm/lib/formatCliente'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

const HEADERS = ['Cliente', 'Teléfono', 'Localidad', 'Interés', 'Canal', 'Estado']
const STATUS = ['activo', 'en_seguimiento', 'vendido', 'perdido']

export default function ClienteTable({ filas, onCambiarStatus }) {
  const navigate = useNavigate()

  return (
    <div className="glass overflow-x-auto rounded-[20px] shadow-glass">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            {HEADERS.map((h) => (
              <th key={h} className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((c) => (
            <tr
              key={c.id}
              onClick={() => navigate(`/crm/clientes/${c.id}`)}
              className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface"
            >
              <td className="px-4 py-3 font-semibold text-ink">{c.nombre}</td>
              <td className="px-4 py-3 text-ink-2">{c.telefono || '—'}</td>
              <td className="px-4 py-3 text-ink-2">{c.localidad || '—'}</td>
              <td className="px-4 py-3 text-ink-2">{lineaInteres(c)}</td>
              <td className="px-4 py-3 text-ink-2">{canalLabel(c.canal)}</td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger aria-label={`Status de ${c.nombre}`} className="inline-flex items-center gap-1">
                    <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                    <ChevronDown size={13} className="text-ink-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="crm-root">
                    {STATUS.map((s) => (
                      <DropdownMenuItem key={s} disabled={s === c.status} onClick={() => onCambiarStatus(c, s)}>
                        {s}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
