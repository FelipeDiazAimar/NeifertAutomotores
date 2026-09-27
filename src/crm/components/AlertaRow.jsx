import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Check, Mail, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import Badge from '@/components/common/Badge'
import Modal from '@/components/common/Modal'
import Button from '@/components/common/Button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/cn'

const iniciales = (n) => (n ?? '?').trim().slice(0, 2).toUpperCase()

function Canal({ enviado, tituloEnviado, tituloPendiente, label, Icon }) {
  return (
    <span
      title={enviado ? tituloEnviado : tituloPendiente}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
        enviado ? 'bg-success/15 text-success' : 'bg-ink/10 text-ink-3',
      )}
    >
      <Icon size={11} />
      {label}
    </span>
  )
}

export default function AlertaRow({ alerta: a, onToggle, onEditar, onEliminar, puedeEliminar }) {
  const [confirmar, setConfirmar] = useState(false)

  return (
    <div className="glass flex items-center gap-3 rounded-2xl p-3">
      <button
        onClick={() => onToggle(a, !a.hecha)}
        aria-label={a.hecha ? 'Marcar no leída' : 'Confirmar lectura'}
        title={a.hecha ? 'Marcar no leída' : 'Confirmar lectura'}
        className={cn(
          'grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors',
          a.hecha ? 'border-success bg-success text-white' : 'border-ink/30 text-transparent hover:border-ink/50',
        )}
      >
        <Check size={14} />
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', a.hecha ? 'text-ink-3 line-through' : 'text-ink')}>
          {a.titulo}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
          <span>{a.fecha} · {a.hora}</span>
          <Canal enviado={a.notificado_push} tituloEnviado="Notificación web enviada" tituloPendiente="Notificación web pendiente" label="Web" Icon={Bell} />
          <Canal enviado={a.notificado_email} tituloEnviado="Email enviado" tituloPendiente="Email pendiente" label="Mail" Icon={Mail} />
          {a.cliente && (
            <Link to={`/crm/clientes/${a.cliente_id}`} onClick={(e) => e.stopPropagation()} className="hover:text-neifert">
              <Badge variant="neutral">{a.cliente.nombre}</Badge>
            </Link>
          )}
          {a.vehiculo && <Badge variant="neutral">{a.vehiculo.marca} {a.vehiculo.modelo}</Badge>}
        </div>
      </div>

      {a.asignado?.nombre && (
        <span title={a.asignado.nombre} className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-neifert/15 text-[10px] font-bold text-neifert">
          {iniciales(a.asignado.nombre)}
        </span>
      )}

      {puedeEliminar && (
        <button
          type="button"
          onClick={() => setConfirmar(true)}
          aria-label="Eliminar alerta"
          title="Eliminar alerta"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface hover:text-neifert"
        >
          <Trash2 size={16} />
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Acciones" className="shrink-0 text-ink-3 hover:text-ink">
          <MoreHorizontal size={18} />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="crm-root">
          <DropdownMenuItem onClick={() => onEditar(a)}>
            <Pencil size={14} /> Editar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Modal open={confirmar} onClose={() => setConfirmar(false)} title="Eliminar alerta">
        <p className="text-sm text-ink-2">Se borra "{a.titulo}". No se puede deshacer.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmar(false)}>Cancelar</Button>
          <Button variant="primary" onClick={() => { setConfirmar(false); onEliminar(a.id) }}>Eliminar</Button>
        </div>
      </Modal>
    </div>
  )
}
