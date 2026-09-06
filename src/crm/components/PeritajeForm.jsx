import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import Select from '@/components/common/Select'
import { PERITAJE_SECCIONES, resumenPeritaje } from '@/crm/lib/peritajeSchema'
import { useCrmUsuarios } from '@/crm/hooks/useCrmUsuarios'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import EstadoStrip from './EstadoStrip'
import { cn } from '@/lib/cn'

const OPCIONES_ESTADO = [
  { v: 'ok', label: 'OK', clase: 'bg-success text-white' },
  { v: 'obs', label: 'Obs.', clase: 'bg-amber text-white' },
  { v: 'falta', label: 'Falta', clase: 'bg-neifert text-white' },
  { v: 'na', label: 'N/A', clase: 'bg-ink/20 text-ink' },
]

function ControlItem({ item, valor, onChange }) {
  if (item.tipo === 'estado') {
    return (
      <div className="flex items-center justify-between gap-2 py-1">
        <span className="text-sm text-ink-2">{item.label}</span>
        <div className="flex gap-1">
          {OPCIONES_ESTADO.map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => onChange(valor === o.v ? '' : o.v)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors',
                valor === o.v ? o.clase : 'glass text-ink-3',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    )
  }
  const tipoInput = item.tipo === 'moneda' || item.tipo === 'porcentaje' ? 'number' : 'text'
  return (
    <Input
      label={item.label}
      type={tipoInput}
      value={valor ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function Seccion({ sec, datos, set }) {
  const [abierta, setAbierta] = useState(true)
  return (
    <div className="rounded-2xl border border-line">
      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        className="flex w-full items-center justify-between px-4 py-3 font-display text-sm font-bold text-ink"
      >
        {sec.titulo}
        <ChevronDown size={16} className={cn('transition-transform', abierta && 'rotate-180')} />
      </button>
      {abierta && (
        <div className="space-y-2 border-t border-line px-4 py-3">
          {sec.items.map((it) => (
            <ControlItem key={it.key} item={it} valor={datos[it.key]} onChange={(v) => set(it.key, v)} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function PeritajeForm({ inicial, onGuardar, guardando }) {
  const { data: usuarios = [] } = useCrmUsuarios()
  const { id: miId } = useCrmPerfil()
  const [datos, setDatos] = useState(inicial?.datos ?? {})
  const [fecha, setFecha] = useState(inicial?.fecha ?? new Date().toISOString().slice(0, 10))
  const [resena, setResena] = useState(inicial?.resena ?? '')
  const [peritadoPor, setPeritadoPor] = useState(inicial?.peritado_por ?? miId ?? '')

  const set = (k, v) => setDatos((d) => ({ ...d, [k]: v }))
  const resumen = useMemo(() => resumenPeritaje(datos), [datos])

  function submit(e) {
    e.preventDefault()
    onGuardar({
      datos,
      fecha,
      resena,
      peritadoPor: peritadoPor || null,
      costo_total: datos.costoTotal ? Number(datos.costoTotal) : null,
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="glass sticky top-2 z-10 rounded-2xl p-3 shadow-glass">
        <EstadoStrip {...{ ok: resumen.items_ok, obs: resumen.items_obs, falta: resumen.items_falta }} showLegend />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <Select
          label="Peritado por"
          options={usuarios.map((u) => ({ id: u.id, label: u.nombre }))}
          value={peritadoPor}
          onChange={setPeritadoPor}
        />
        <Input
          label="Costo total"
          type="number"
          value={datos.costoTotal ?? ''}
          onChange={(e) => set('costoTotal', e.target.value)}
        />
      </div>
      <Input as="textarea" label="Reseña" value={resena} onChange={(e) => setResena(e.target.value)} />

      {/* columnas tipo mampostería: cada sección fluye sin alinearse por fila,
          así no quedan huecos cuando una es mucho más alta que la otra. */}
      <div className="gap-3 [column-fill:balance] sm:columns-2 [&>*]:mb-3 [&>*]:break-inside-avoid">
        {PERITAJE_SECCIONES.map((sec) => (
          <Seccion key={sec.id} sec={sec} datos={datos} set={set} />
        ))}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar peritaje'}
        </Button>
      </div>
    </form>
  )
}
