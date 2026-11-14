import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Trash2, X } from 'lucide-react'
import Modal from '@/components/common/Modal'
import Button from '@/components/common/Button'
import Badge from '@/components/common/Badge'
import Spinner from '@/components/common/Spinner'
import { useClienteMutations } from '@/crm/hooks/useClientes'
import { useDuplicados } from '@/crm/hooks/useDuplicados'
import { agruparDuplicados, normNombre } from '@/crm/lib/leadCliente'
import { CANAL_OPCIONES, canalLabel, lineaInteres, statusVariant } from '@/crm/lib/formatCliente'
import { cn } from '@/lib/cn'

const STATUS = [
  { id: 'activo', label: 'Activo' },
  { id: 'en_seguimiento', label: 'En seguimiento' },
  { id: 'vendido', label: 'Vendido' },
  { id: 'perdido', label: 'Perdido' },
]
const STATUS_LABEL = Object.fromEntries(STATUS.map((s) => [s.id, s.label]))
const FILTROS_VACIOS = { status: [], canal: [], incluirArchivados: false }

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR') : '—')
const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '')

function Chip({ activo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
        activo ? 'bg-neifert text-white' : 'glass text-ink-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

function Dato({ label, children }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">{label}</dt>
      <dd className="break-words text-sm text-ink">{children || '—'}</dd>
    </div>
  )
}

function FichaComparable({ c, onVer, onEliminar }) {
  const interes = lineaInteres(c)
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-surface/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="font-display text-base font-bold text-ink">{c.nombre}</span>
        <Badge variant={statusVariant(c.status)}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
      </div>
      {c.archivado_en && <p className="text-xs font-semibold text-amber">Archivado</p>}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        <Dato label="Teléfono">{c.telefono}</Dato>
        <Dato label="Localidad">{c.localidad}</Dato>
        <Dato label="Canal">{canalLabel(c.canal)}</Dato>
        <Dato label="Alta">{fecha(c.creado_en)}</Dato>
        <Dato label="Vehículos de interés">{c.intereses?.length ?? 0}</Dato>
        <Dato label="Autos en entrega">{c.autos_entrega?.length ?? 0}</Dato>
      </dl>
      <div className="mt-2 space-y-2">
        <Dato label="Interés">{interes === '—' ? '' : interes}</Dato>
        <Dato label="Notas">{c.notas}</Dato>
      </div>
      <div className="mt-auto flex gap-2 pt-4">
        <Button size="sm" variant="glass" onClick={onVer}>
          Ver ficha
        </Button>
        <Button size="sm" variant="outline" icon={Trash2} onClick={onEliminar}>
          Eliminar este
        </Button>
      </div>
    </div>
  )
}

/** Teléfonos repetidos: cada grupo muestra las fichas lado a lado para
 *  compararlas y eliminar la que sobra (con confirmación). Buscador y filtros
 *  propios, con el mismo criterio que la lista de Clientes. */
export default function DuplicadosModal({ open, onClose }) {
  const navigate = useNavigate()
  const { todos, isLoading } = useDuplicados()
  const { eliminar } = useClienteMutations()
  const [busqueda, setBusqueda] = useState('')
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  const [aEliminar, setAEliminar] = useState(null)

  const toggleEn = (clave, valor) =>
    setFiltros((f) => ({
      ...f,
      [clave]: f[clave].includes(valor) ? f[clave].filter((v) => v !== valor) : [...f[clave], valor],
    }))
  const activos = filtros.status.length + filtros.canal.length + (filtros.incluirArchivados ? 1 : 0)

  const grupos = useMemo(() => {
    const base = filtros.incluirArchivados ? todos : todos.filter((c) => !c.archivado_en)
    const q = normNombre(busqueda)
    const qDigitos = soloDigitos(busqueda)
    const coincide = (c) =>
      (!filtros.status.length || filtros.status.includes(c.status)) &&
      (!filtros.canal.length || filtros.canal.includes(c.canal)) &&
      (!q ||
        [c.nombre, c.localidad].some((v) => normNombre(v).includes(q)) ||
        (qDigitos && soloDigitos(c.telefono).includes(qDigitos)))
    // Un grupo se muestra si alguno de sus clientes cumple; se ve completo para poder compararlo.
    return agruparDuplicados(base).filter((g) => g.clientes.some(coincide))
  }, [todos, busqueda, filtros])

  const confirmarEliminar = async () => {
    try {
      await eliminar.mutateAsync(aEliminar.id)
      setAEliminar(null)
    } catch {
      // el hook ya mostró el error
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={aEliminar ? () => {} : onClose}
        title="Clientes con teléfono repetido"
        size="xl"
      >
        <div className="glass field-glass flex h-12 items-center gap-2.5 rounded-2xl px-3.5">
          <Search size={17} className="shrink-0 text-ink-3" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, teléfono o localidad…"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
        </div>

        <div className="glass mt-3 rounded-[20px] p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Estado</p>
              <div className="flex flex-wrap gap-1.5">
                {STATUS.map((s) => (
                  <Chip key={s.id} activo={filtros.status.includes(s.id)} onClick={() => toggleEn('status', s.id)}>
                    {s.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Canal</p>
              <div className="flex flex-wrap gap-1.5">
                {CANAL_OPCIONES.map((c) => (
                  <Chip key={c.id} activo={filtros.canal.includes(c.id)} onClick={() => toggleEn('canal', c.id)}>
                    {c.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Mostrar</p>
              <label className="flex items-center gap-2 text-xs text-ink-2">
                <input
                  type="checkbox"
                  checked={filtros.incluirArchivados}
                  onChange={(e) => setFiltros((f) => ({ ...f, incluirArchivados: e.target.checked }))}
                />
                Incluir archivados
              </label>
              {activos > 0 && (
                <Button variant="ghost" size="sm" icon={X} className="mt-2" onClick={() => setFiltros(FILTROS_VACIOS)}>
                  Limpiar
                </Button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-4 text-sm text-ink-3">
          {grupos.length} {grupos.length === 1 ? 'teléfono repetido' : 'teléfonos repetidos'}
        </p>

        {isLoading ? (
          <div className="grid place-items-center py-12">
            <Spinner size={28} />
          </div>
        ) : grupos.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-3">No hay duplicados que coincidan.</p>
        ) : (
          <div className="mt-3 space-y-5">
            {grupos.map((g) => {
              const mismoNombre = new Set(g.clientes.map((c) => normNombre(c.nombre))).size === 1
              return (
                <section key={g.clave}>
                  <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-2">
                    <span>{g.clientes[0].telefono}</span>
                    <Badge variant={mismoNombre ? 'amber' : 'neutral'}>
                      {mismoNombre
                        ? 'Mismo nombre: probable duplicado'
                        : 'Nombres distintos: puede ser un número compartido'}
                    </Badge>
                  </p>
                  <div className={cn('grid gap-3', g.clientes.length > 2 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
                    {g.clientes.map((c) => (
                      <FichaComparable
                        key={c.id}
                        c={c}
                        onVer={() => {
                          onClose()
                          navigate(`/crm/clientes/${c.id}`)
                        }}
                        onEliminar={() => setAEliminar(c)}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(aEliminar)} onClose={() => setAEliminar(null)} title="¿Eliminar este cliente?" size="sm">
        {aEliminar && (
          <>
            <p className="text-sm text-ink-2">
              Vas a eliminar a <strong className="text-ink">{aEliminar.nombre}</strong> (alta{' '}
              {fecha(aEliminar.creado_en)}). Esta acción no se puede deshacer.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-ink-3">
              <li>
                Se borran también sus {aEliminar.intereses?.length ?? 0} vehículos de interés y{' '}
                {aEliminar.autos_entrega?.length ?? 0} autos en entrega.
              </li>
              <li>Las tareas y alertas que tenga quedan sin cliente asociado.</li>
              <li>Si querés conservar algo de esta ficha, pasalo a la otra antes.</li>
            </ul>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setAEliminar(null)}>
                Cancelar
              </Button>
              <Button icon={Trash2} disabled={eliminar.isPending} onClick={confirmarEliminar}>
                {eliminar.isPending ? 'Eliminando…' : 'Sí, eliminar'}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  )
}
