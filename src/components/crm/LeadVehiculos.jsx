import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import Select from '@/components/common/Select'
import GlassCard from '@/components/common/GlassCard'
import { formatMiles, parseMiles } from '@/lib/numberMask'
import { cn } from '@/lib/cn'

const CONDICIONES = [
  { id: 'usado', label: 'Usado' },
  { id: 'cero', label: 'Cero km' },
]

const VACIO = {
  condicion: 'usado', marca: '', modelo: '', version: '',
  anio: '', color: '', km: '', trans: '', notas: '',
}

/** Título del item: marca + modelo + versión (el año va como dato). */
function tituloVehiculo(v) {
  return [v?.marca, v?.modelo, v?.version].filter(Boolean).join(' ') || 'Vehículo'
}

/** Todos los datos cargados, con etiqueta, omitiendo vacíos. */
function detallesVehiculo(v) {
  return [
    v?.anio != null && { label: 'Año', value: String(v.anio) },
    v?.color && { label: 'Color', value: v.color },
    v?.km != null && { label: 'Km', value: `${formatMiles(v.km)} km` },
    v?.trans && { label: 'Transmisión', value: v.trans },
  ].filter(Boolean)
}

/** Editor reutilizable de listas de vehículos (CRM viejo y nuevo):
 *  sirve para "interés" y para "entrega" — mismo shape en ambos.
 *  Cada item: { condicion, marca, modelo, version, anio, color, km, notas }
 *  (+ `trans` solo si `conTransmision`, para autos en entrega del CRM nuevo).
 *  El listado siempre se ve; la card de carga aparece tras "Agregar vehículo"
 *  (botón propio, o controlado desde afuera con `abierto`/`onCambiarAbierto`
 *  + `botonPropio={false}` cuando el disparador vive en otro lugar).
 *  OJO: no usa <form> propio (ver comentario en el JSX). */
export default function LeadVehiculos({
  items = [],
  onAgregar,
  onQuitar,
  pending = false,
  emptyText = 'Sin vehículos cargados.',
  conTransmision = false,
  botonPropio = true,
  abierto = undefined,
  onCambiarAbierto = undefined,
}) {
  const [form, setForm] = useState(VACIO)
  const [abiertoInterno, setAbiertoInterno] = useState(false)
  const estaAbierto = abierto ?? abiertoInterno
  const setAbierto = onCambiarAbierto ?? setAbiertoInterno
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  function agregar() {
    if (!form.marca.trim()) return
    onAgregar({
      condicion: form.condicion,
      marca: form.marca.trim(),
      modelo: form.modelo.trim() || null,
      version: form.version.trim() || null,
      anio: form.anio ? Number(form.anio) : null,
      color: form.color.trim() || null,
      // Cero km: no se pide Km, se asume 0.
      km: form.condicion === 'cero' ? 0 : form.km ? Number(form.km) : null,
      ...(conTransmision ? { trans: form.trans.trim() || null } : {}),
      notas: form.notas.trim() || null,
    })
    setForm(VACIO)
  }

  function cancelar() {
    setForm(VACIO)
    setAbierto(false)
  }

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-ink-2">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((v, i) => {
            const detalles = detallesVehiculo(v)
            return (
              <li key={`${tituloVehiculo(v)}-${i}`}>
                <GlassCard className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0 text-sm">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                      <span>{tituloVehiculo(v)}</span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                          v.condicion === 'cero' ? 'bg-ink text-bg' : 'bg-neifert/15 text-neifert'
                        )}
                      >
                        {v.condicion === 'cero' ? 'Cero km' : 'Usado'}
                      </span>
                    </p>
                    {detalles.length > 0 && (
                      <p className="mt-1 text-xs text-ink-2">
                        {detalles.map((d) => (
                          <span key={d.label} className="mr-3 inline-block">
                            <span className="font-semibold text-ink-3">{d.label}: </span>
                            {d.value}
                          </span>
                        ))}
                      </p>
                    )}
                    {v?.notas && (
                      <p className="mt-1 text-xs text-ink-3">
                        <span className="font-semibold">Notas: </span>
                        {v.notas}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onQuitar(i)}
                    aria-label={`Quitar ${tituloVehiculo(v)}`}
                    className="shrink-0 text-ink-3 transition-colors hover:text-neifert"
                  >
                    <Trash2 size={16} />
                  </button>
                </GlassCard>
              </li>
            )
          })}
        </ul>
      )}

      {!estaAbierto ? (
        botonPropio && (
          <Button type="button" variant="glass" size="sm" icon={Plus} onClick={() => setAbierto(true)}>
            Agregar vehículo
          </Button>
        )
      ) : (
        /* OJO: es un <div>, no un <form>. El parser HTML ignora un <form>
          anidado dentro de otro (LeadForm) y el botón "Agregar" terminaría
          disparando el registro del lead en vez de acumular en el listado. */
        <div className="rounded-2xl border border-dashed border-line p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Select label="Condición" options={CONDICIONES} value={form.condicion} onChange={(v) => set('condicion', v)} />
            <Input label="Marca *" value={form.marca} onChange={(e) => set('marca', e.target.value)} placeholder="Ej. Toyota" />
            <Input label="Modelo" value={form.modelo} onChange={(e) => set('modelo', e.target.value)} placeholder="Ej. Corolla" />
            <Input label="Versión" value={form.version} onChange={(e) => set('version', e.target.value)} placeholder="Ej. XEi" />
            <Input label="Año" type="number" value={form.anio} onChange={(e) => set('anio', e.target.value)} placeholder="Ej. 2022" />
            <Input label="Color" value={form.color} onChange={(e) => set('color', e.target.value)} placeholder="Ej. Blanco" />
            {form.condicion !== 'cero' && (
              <Input label="Km" inputMode="numeric" value={formatMiles(form.km)} onChange={(e) => set('km', parseMiles(e.target.value))} placeholder="Ej. 50.000" />
            )}
            {conTransmision && (
              <Input label="Transmisión" value={form.trans} onChange={(e) => set('trans', e.target.value)} placeholder="Ej. Automática" />
            )}
            <Input label="Notas" value={form.notas} onChange={(e) => set('notas', e.target.value)} placeholder="Detalle…" />
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" icon={X} onClick={cancelar}>
              Cancelar
            </Button>
            <Button type="button" size="sm" icon={Plus} onClick={agregar} disabled={pending || !form.marca.trim()}>
              Agregar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
