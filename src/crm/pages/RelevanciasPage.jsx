import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, GripVertical, Search } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Spinner from '@/components/common/Spinner'
import GlassCard from '@/components/common/GlassCard'
import RelevanciaCard from '@/crm/components/RelevanciaCard'
import { useCrmRealtime } from '@/crm/hooks/useCrmRealtime'
import { useGuardarRelevancias, useVehiculosRelevancia } from '@/crm/hooks/useRelevancias'
import {
  COL_RANKED,
  COL_SIN,
  cambiosDeRelevancia,
  coincideBusqueda,
  columnaDe,
  dividirPorRelevancia,
  moverEntreColumnas,
  reordenarEnColumna,
} from '@/crm/lib/relevancia'
import { cn } from '@/lib/cn'

const ESTADOS = [
  { id: 'disponible', label: 'Disponible' },
  { id: 'reservado', label: 'Reservado' },
  { id: 'vendido', label: 'Vendido' },
]

/** Chips de estado (multi-selección; ninguno = todos). */
function FiltroEstado({ valor, onChange }) {
  const toggle = (id) => onChange(valor.includes(id) ? valor.filter((e) => e !== id) : [...valor, id])
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por estado">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Estado</span>
      {ESTADOS.map((e) => (
        <button
          key={e.id}
          type="button"
          aria-pressed={valor.includes(e.id)}
          onClick={() => toggle(e.id)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
            valor.includes(e.id) ? 'bg-neifert text-white' : 'glass text-ink-2 hover:text-ink',
          )}
        >
          {e.label}
        </button>
      ))}
    </div>
  )
}

const TIPOS = [
  { id: 'usados', label: 'Usados', cero: false },
  { id: 'cero', label: '0 km', cero: true },
]

/** Columna soltable (acepta drops aunque esté vacía). */
function Columna({
  id,
  titulo,
  descripcion,
  cantidad,
  visibles,
  vacio,
  busqueda,
  onBusqueda,
  filtrando = false,
  filtros,
  children,
  className,
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <GlassCard className={cn('p-4', className)}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-bold text-ink">{titulo}</h2>
          <p className="text-xs text-ink-3">{descripcion}</p>
        </div>
        <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold text-ink-2">
          {busqueda.trim() || filtrando ? `${visibles} de ${cantidad}` : cantidad}
        </span>
      </div>
      <div className="glass field-glass mb-3 flex h-10 items-center gap-2 rounded-2xl px-3">
        <Search size={15} className="shrink-0 text-ink-3" />
        <input
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
          placeholder="Buscar marca, modelo, año, patente, dueño…"
          aria-label={`Buscar en ${titulo}`}
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
        />
      </div>
      {filtros}
      <div
        ref={setNodeRef}
        data-lenis-prevent
        className={cn(
          'min-h-32 rounded-2xl transition-colors',
          isOver && 'bg-neifert/5 ring-2 ring-neifert/40',
        )}
      >
        {visibles === 0 && (
          <div className="grid min-h-32 place-items-center rounded-2xl border border-dashed border-line px-4 text-center text-sm text-ink-3">
            {cantidad === 0 ? vacio : 'Ningún vehículo coincide con la búsqueda.'}
          </div>
        )}
        {children}
      </div>
    </GlassCard>
  )
}

/** Wrapper que le da a dnd-kit el nodo y el estilo sin romper el tooltip. */
function Sortable({ vehiculo, posicion, arrastrando }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: vehiculo.id,
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('touch-manipulation', isDragging && 'opacity-30')}
      {...attributes}
      {...listeners}
    >
      <RelevanciaCard vehiculo={vehiculo} posicion={posicion} ocultarInfo={arrastrando} />
    </div>
  )
}

export default function RelevanciasPage() {
  const [tipo, setTipo] = useState('usados')
  const cero = TIPOS.find((t) => t.id === tipo).cero
  const { data, isLoading } = useVehiculosRelevancia(cero)
  const guardar = useGuardarRelevancias()
  const [activoId, setActivoId] = useState(null)
  // Edición local (mientras se arrastra y hasta que el servidor confirma); null = lo del servidor.
  const [edicion, setEdicion] = useState(null)
  const [datosPrev, setDatosPrev] = useState(data)
  if (data !== datosPrev) {
    setDatosPrev(data)
    if (!activoId) setEdicion(null)
  }

  useCrmRealtime('vehiculos', ['crm', 'vehiculos', 'relevancia'])

  const porId = useMemo(() => new Map((data ?? []).map((v) => [v.id, v])), [data])
  const actuales = useMemo(
    () => new Map((data ?? []).map((v) => [v.id, v.orden_relevancia ?? null])),
    [data],
  )

  const base = useMemo(() => dividirPorRelevancia(data ?? []), [data])
  const cols = edicion ?? base

  // La búsqueda solo filtra lo que se ve: el orden (y los # del ranking) siguen
  // siendo los de la lista completa. El vehículo que se arrastra no se oculta.
  const [busqueda, setBusqueda] = useState({ [COL_RANKED]: '', [COL_SIN]: '' })
  // Filtro por estado de la columna derecha (vacío = todos).
  const [estadosSin, setEstadosSin] = useState([])
  const visibles = (col) =>
    cols[col].filter((id) => {
      if (id === activoId) return true
      const v = porId.get(id) ?? {}
      if (col === COL_SIN && estadosSin.length && !estadosSin.includes(v.estado)) return false
      return coincideBusqueda(v, busqueda[col])
    })
  const visiblesRanked = visibles(COL_RANKED)
  const visiblesSin = visibles(COL_SIN)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const alEmpezar = ({ active }) => setActivoId(active.id)

  const alPasarSobre = ({ active, over }) => {
    if (!over) return
    setEdicion((c) => moverEntreColumnas(c ?? base, active.id, over.id))
  }

  const alSoltar = ({ active, over }) => {
    setActivoId(null)
    if (!over) {
      setEdicion(null)
      return
    }
    const final = reordenarEnColumna(cols, active.id, over.id)
    setEdicion(final)
    const cambios = cambiosDeRelevancia(actuales, final)
    if (cambios.length) guardar.mutate(cambios, { onError: () => setEdicion(null) })
    else setEdicion(null)
  }

  const alCancelar = () => {
    setActivoId(null)
    setEdicion(null)
  }

  const activo = activoId ? porId.get(activoId) : null
  const arrastrando = Boolean(activoId)
  const hayDatos = (data?.length ?? 0) > 0

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <Link
            to="/crm/vehiculos"
            className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-3 transition-colors hover:text-ink"
          >
            <ArrowLeft size={14} /> Vehículos
          </Link>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h1 className="font-display text-2xl font-bold text-ink">Relevancias</h1>
            <p className="flex items-center gap-1.5 text-xs text-ink-3">
              <GripVertical size={13} /> El orden se guarda solo al soltar cada vehículo.
            </p>
          </div>
          <p className="text-sm text-ink-3">
            Arrastrá los vehículos para armar el orden del catálogo. El #1 se muestra primero en la web. Los
            de la derecha (sin relevancia) se muestran después de todo el ranking, del año más nuevo al más
            viejo.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:pt-5">
          <span className="text-xs font-semibold text-ink-3" aria-live="polite">
            {guardar.isPending ? 'Guardando…' : guardar.isSuccess ? 'Guardado' : ''}
          </span>
          <div role="tablist" aria-label="Catálogo" className="glass flex rounded-2xl p-1">
            {TIPOS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tipo === t.id}
                onClick={() => setTipo(t.id)}
                className={cn(
                  'rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
                  tipo === t.id ? 'bg-neifert text-white' : 'text-ink-2 hover:text-ink',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner size={28} />
        </div>
      ) : !hayDatos ? (
        <GlassCard className="p-10 text-center">
          <p className="font-display font-bold text-ink">No hay vehículos en el catálogo de {tipo === 'cero' ? '0 km' : 'usados'}</p>
          <p className="mt-1 text-sm text-ink-3">Solo aparecen los publicados (disponibles, reservados o vendidos).</p>
        </GlassCard>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={alEmpezar}
          onDragOver={alPasarSobre}
          onDragEnd={alSoltar}
          onDragCancel={alCancelar}
        >
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <Columna
              id={COL_RANKED}
              titulo="Ranking del catálogo"
              descripcion="En este orden se ven en la web"
              cantidad={cols[COL_RANKED].length}
              visibles={visiblesRanked.length}
              busqueda={busqueda[COL_RANKED]}
              onBusqueda={(t) => setBusqueda((b) => ({ ...b, [COL_RANKED]: t }))}
              vacio="Arrastrá vehículos acá para darles relevancia."
            >
              <SortableContext items={visiblesRanked} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {visiblesRanked.map((id) => {
                    const v = porId.get(id)
                    return (
                      v && (
                        <Sortable
                          key={id}
                          vehiculo={v}
                          posicion={cols[COL_RANKED].indexOf(id) + 1}
                          arrastrando={arrastrando}
                        />
                      )
                    )
                  })}
                </div>
              </SortableContext>
            </Columna>

            <Columna
              id={COL_SIN}
              titulo="Sin relevancia"
              descripcion="Se muestran después del ranking, del más nuevo al más viejo"
              cantidad={cols[COL_SIN].length}
              visibles={visiblesSin.length}
              busqueda={busqueda[COL_SIN]}
              onBusqueda={(t) => setBusqueda((b) => ({ ...b, [COL_SIN]: t }))}
              filtrando={estadosSin.length > 0}
              filtros={<FiltroEstado valor={estadosSin} onChange={setEstadosSin} />}
              vacio="Todos los vehículos tienen relevancia."
              className="lg:sticky lg:top-4"
            >
              <SortableContext items={visiblesSin} strategy={rectSortingStrategy}>
                <div className="grid max-h-[70vh] grid-cols-2 gap-3 overflow-y-auto pr-1" data-lenis-prevent>
                  {visiblesSin.map((id) => {
                    const v = porId.get(id)
                    return v && <Sortable key={id} vehiculo={v} arrastrando={arrastrando} />
                  })}
                </div>
              </SortableContext>
            </Columna>
          </div>

          <DragOverlay>
            {activo ? (
              <div className="cursor-grabbing shadow-glass">
                <RelevanciaCard
                  vehiculo={activo}
                  posicion={columnaDe(cols, activoId) === COL_RANKED ? cols[COL_RANKED].indexOf(activoId) + 1 : null}
                  sinInfo
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

    </div>
  )
}
