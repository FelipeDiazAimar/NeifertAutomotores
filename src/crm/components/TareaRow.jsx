import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, MoreHorizontal, Pencil, Archive, Trash2 } from 'lucide-react'
import Badge from '@/components/common/Badge'
import Modal from '@/components/common/Modal'
import Button from '@/components/common/Button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/cn'

const iniciales = (n) => (n ?? '?').trim().slice(0, 2).toUpperCase()

export default function TareaRow({ tarea: t, onToggle, onEditar, onArchivar, onEliminar, puedeEliminar }) {
  const [confirmar, setConfirmar] = useState(false)

  return (
    <div className="glass flex items-center gap-3 rounded-2xl p-3">
      <button
        onClick={() => onToggle(t, !t.done)}
        aria-label={t.done ? 'Marcar pendiente' : 'Marcar hecha'}
        className={cn(
          'grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors',
          t.done ? 'border-success bg-success text-white' : 'border-ink/30 text-transparent hover:border-ink/50',
        )}
      >
        <Check size={14} />
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', t.done ? 'text-ink-3 line-through' : 'text-ink')}>
          {t.titulo}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
          <span>
            {t.fecha}
            {t.hora ? ` · ${t.hora}` : ''}
          </span>
          {t.prioridad === 'alta' && <Badge variant="red">Alta</Badge>}
          {t.cliente && (
            <Link to={`/crm/clientes/${t.cliente_id}`} onClick={(e) => e.stopPropagation()} className="hover:text-neifert">
              <Badge variant="neutral">{t.cliente.nombre}</Badge>
            </Link>
          )}
          {t.vehiculo && (
            <Badge variant="neutral">
              {t.vehiculo.marca} {t.vehiculo.modelo}
            </Badge>
          )}
        </div>
      </div>

      {t.asignado?.nombre && (
        <span
          title={t.asignado.nombre}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-neifert/15 text-[10px] font-bold text-neifert"
        >
          {iniciales(t.asignado.nombre)}
        </span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Acciones" className="shrink-0 text-ink-3 hover:text-ink">
          <MoreHorizontal size={18} />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="crm-root">
          <DropdownMenuItem onClick={() => onEditar(t)}>
            <Pencil size={14} /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onArchivar(t.id)}>
            <Archive size={14} /> Archivar
          </DropdownMenuItem>
          {puedeEliminar && (
            <DropdownMenuItem onClick={() => setConfirmar(true)}>
              <Trash2 size={14} /> Eliminar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Modal open={confirmar} onClose={() => setConfirmar(false)} title="Eliminar tarea">
        <p className="text-sm text-ink-2">Se borra “{t.titulo}”. No se puede deshacer.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmar(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setConfirmar(false)
              onEliminar(t.id)
            }}
          >
            Eliminar
          </Button>
        </div>
      </Modal>
    </div>
  )
}
