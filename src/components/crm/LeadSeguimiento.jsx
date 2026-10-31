import { Bell, CheckSquare } from 'lucide-react'
import Input from '@/components/common/Input'
import Select from '@/components/common/Select'
import GlassCard from '@/components/common/GlassCard'
import {
  useTareasDeProspecto,
  useTareaMutations,
} from '@/crm/hooks/useTareas'
import {
  useAlertasDeProspecto,
  useAlertaMutations,
} from '@/crm/hooks/useAlertas'
import { cn } from '@/lib/cn'

const PRIORIDADES = [
  { id: 'baja', label: 'Baja' },
  { id: 'normal', label: 'Normal' },
  { id: 'alta', label: 'Alta' },
]

/** Mismo contenedor que las cards de vehículos del formulario de lead. */
function Card({ icon: Icon, titulo, detalle, tono, children }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/50 p-4 md:p-5">
      <div className="mb-4 flex items-center gap-3">
        <span
          className={cn(
            'grid h-9 w-9 shrink-0 place-items-center rounded-full',
            tono === 'amber' ? 'bg-amber/15 text-amber' : 'bg-neifert/15 text-neifert'
          )}
        >
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold text-ink">{titulo}</p>
          <p className="truncate text-xs text-ink-3">{detalle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

/** Tarea opcional del lead nuevo. `value`/`onChange` manejan el objeto entero. */
export function TareaCampos({ value, onChange, usuarios, miId }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value })
  return (
    <Card
      icon={CheckSquare}
      titulo="Tarea"
      detalle="Algo para hacer con este lead"
    >
      <div className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-4">
          <Input
            label="Título"
            placeholder="Ej. Llamar para confirmar la visita"
            value={value.titulo}
            onChange={set('titulo')}
          />
        </div>
        <Input label="Vence" type="date" value={value.fecha} onChange={set('fecha')} />
        <Input label="Hora" type="time" value={value.hora} onChange={set('hora')} />
        <div className="md:col-span-2">
          <Select
            label="Prioridad"
            options={PRIORIDADES}
            value={value.prioridad}
            onChange={(v) => onChange({ ...value, prioridad: v })}
          />
        </div>
        <div className="md:col-span-4">
          <Select
            label="Asignado a"
            options={usuarios.map((u) => ({ id: u.id, label: u.nombre }))}
            value={value.asignado_a || miId || ''}
            onChange={(v) => onChange({ ...value, asignado_a: v })}
          />
        </div>
      </div>
    </Card>
  )
}

/** Alerta opcional del lead nuevo (avisa por notificación y mail a esa hora). */
export function AlertaCampos({ value, onChange, usuarios, miId }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value })
  return (
    <Card
      icon={Bell}
      tono="amber"
      titulo="Alerta"
      detalle="Un aviso con fecha y hora — te llega por notificación y mail"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Input
            label="Título"
            placeholder="Ej. Recordarle el presupuesto"
            value={value.titulo}
            onChange={set('titulo')}
          />
        </div>
        <Input label="Fecha" type="date" value={value.fecha} onChange={set('fecha')} />
        <Input label="Hora" type="time" value={value.hora} onChange={set('hora')} />
        <div className="md:col-span-2">
          <Select
            label="Asignado a"
            options={usuarios.map((u) => ({ id: u.id, label: u.nombre }))}
            value={value.asignado_a || miId || ''}
            onChange={(v) => onChange({ ...value, asignado_a: v })}
          />
        </div>
      </div>
    </Card>
  )
}

/** Tareas y alertas vinculadas a un lead, en su ficha. */
export default function SeguimientoLead({ prospectoId }) {
  const { data: tareas = [] } = useTareasDeProspecto(prospectoId)
  const { data: alertas = [] } = useAlertasDeProspecto(prospectoId)
  const { toggleDone } = useTareaMutations()
  const { toggleHecha } = useAlertaMutations()

  if (!tareas.length && !alertas.length) return null

  const fila = (key, hecha, onToggle, titulo, fecha, hora, Icon) => (
    <li key={key} className="flex items-center gap-3 py-2.5">
      <input
        type="checkbox"
        checked={hecha}
        onChange={onToggle}
        aria-label={hecha ? 'Marcar pendiente' : 'Marcar hecha'}
        className="h-4 w-4 shrink-0 accent-[var(--color-neifert)]"
      />
      <Icon size={15} className="shrink-0 text-ink-3" />
      <span className={cn('min-w-0 flex-1 truncate text-sm', hecha ? 'text-ink-3 line-through' : 'text-ink')}>
        {titulo}
      </span>
      <span className="shrink-0 text-xs text-ink-3">
        {fecha}
        {hora ? ` · ${hora}` : ''}
      </span>
    </li>
  )

  return (
    <GlassCard className="mt-6 p-6 md:p-8">
      <h2 className="font-display text-base font-bold text-ink">Tareas y alertas</h2>
      <ul className="mt-2 divide-y divide-line">
        {tareas.map((t) =>
          fila(`t${t.id}`, t.done, () => toggleDone.mutate({ id: t.id, done: !t.done }), t.titulo, t.fecha, t.hora, CheckSquare)
        )}
        {alertas.map((a) =>
          fila(`a${a.id}`, a.hecha, () => toggleHecha.mutate({ id: a.id, hecha: !a.hecha }), a.titulo, a.fecha, a.hora, Bell)
        )}
      </ul>
    </GlassCard>
  )
}
