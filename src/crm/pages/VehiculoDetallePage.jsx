import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Plus, ChevronRight, Pencil } from 'lucide-react'
import Button from '@/components/common/Button'
import Spinner from '@/components/common/Spinner'
import GlassCard from '@/components/common/GlassCard'
import Modal from '@/components/common/Modal'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useVehiculo, useVehiculoMutations } from '@/crm/hooks/useVehiculos'
import { usePeritajes, usePeritaje, usePeritajeMutations } from '@/crm/hooks/usePeritajes'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import FichaVehiculo from '@/crm/components/FichaVehiculo'
import PeritajeForm from '@/crm/components/PeritajeForm'
import PeritajeLectura from '@/crm/components/PeritajeLectura'
import GestoriaChecklist from '@/crm/components/GestoriaChecklist'
import HistorialTimeline from '@/crm/components/HistorialTimeline'
import EstadoStrip from '@/crm/components/EstadoStrip'
import FotoMultiSlot from '@/crm/components/FotoMultiSlot'
import { estadoPeritaje, PERITAJE_ESTADO_LABEL } from '@/crm/lib/peritajeSchema'
import { cn } from '@/lib/cn'

const fmtFecha = (f) => (f ? new Date(f).toLocaleDateString('es-AR') : '—')
const nfMonto = new Intl.NumberFormat('es-AR')

function ChipCount({ tono, n, label }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-xs text-ink-2">
      <span className={cn('h-1.5 w-1.5 rounded-full', tono)} />
      {n} {label}
    </span>
  )
}

function PeritajePanel({ vehiculoId, vehiculo, esAdmin }) {
  const { data: peritajes = [], isLoading } = usePeritajes(vehiculoId)
  const { crear, actualizar, eliminar } = usePeritajeMutations(vehiculoId)
  const [nuevo, setNuevo] = useState(false)
  const [verId, setVerId] = useState(null)
  const [editando, setEditando] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const { data: seleccionado } = usePeritaje(verId)

  // Desde ahora rige UN peritaje por vehículo: solo se puede crear cuando no
  // hay ninguno. Los que ya tenían varios se resuelven abajo (conservar uno).
  const duplicados = peritajes.length > 1
  const tieneUno = peritajes.length === 1

  function abrirVer(id) {
    setEditando(false)
    setVerId(id)
  }

  async function confirmarAccion() {
    if (!confirmar) return
    try {
      if (confirmar.tipo === 'conservar') {
        for (const p of peritajes.filter((p) => p.id !== confirmar.id)) {
          await eliminar.mutateAsync(p.id)
        }
      } else {
        await eliminar.mutateAsync(confirmar.id)
        if (verId === confirmar.id) setVerId(null)
      }
    } finally {
      setConfirmar(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        {peritajes.length === 0 && !isLoading && (
          <Button icon={Plus} onClick={() => setNuevo(true)}>
            Nuevo peritaje
          </Button>
        )}
        {tieneUno && (
          <p className="text-xs text-ink-3">Un peritaje por vehículo — tocá la tarjeta para verlo o editarlo.</p>
        )}
      </div>

      {duplicados && (
        <GlassCard className="border-amber/40 p-4">
          <p className="font-semibold text-ink">
            Este vehículo tiene {peritajes.length} peritajes
          </p>
          <p className="mt-1 text-sm text-ink-2">
            Ahora se permite uno solo por vehículo. Revisá cada uno y elegí cuál conservar
            {esAdmin ? '' : ' — solo un admin puede eliminar'}.
          </p>
        </GlassCard>
      )}

      {isLoading ? (
        <div className="grid place-items-center py-8">
          <Spinner size={24} />
        </div>
      ) : peritajes.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <p className="text-sm text-ink-3">Este vehículo todavía no tiene peritajes.</p>
        </GlassCard>
      ) : (
        <ul className="space-y-2">
          {peritajes.map((p) => {
            const quien = p.peritador?.nombre || p.peritado_por_nombre
            const est = estadoPeritaje(p)
            return (
                <li key={p.id} className="space-y-2">
                  <GlassCard
                    as="button"
                    onClick={() => abrirVer(p.id)}
                    className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-surface"
                  >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-ink">{fmtFecha(p.fecha)}</span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          est === 'completo' && 'bg-success/15 text-success',
                          est === 'en_proceso' && 'bg-amber/15 text-amber',
                          est === 'sin_iniciar' && 'bg-ink/10 text-ink-3',
                        )}
                      >
                        {PERITAJE_ESTADO_LABEL[est]}
                      </span>
                      {quien && <span className="text-xs text-ink-3">· {quien}</span>}
                      {p.costo_total ? (
                        <span className="text-xs text-ink-3">· $ {nfMonto.format(p.costo_total)}</span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <ChipCount tono="bg-success" n={p.items_ok} label="OK" />
                      <ChipCount tono="bg-amber" n={p.items_obs} label="obs." />
                      <ChipCount tono="bg-neifert" n={p.items_falta} label="faltas" />
                    </div>
                    <EstadoStrip ok={p.items_ok} obs={p.items_obs} falta={p.items_falta} />
                  </div>
                    <ChevronRight size={18} className="shrink-0 text-ink-3" />
                  </GlassCard>
                  {duplicados && esAdmin && (
                    <div className="flex flex-wrap gap-2 pl-1">
                      <Button
                        variant="glass"
                        size="sm"
                        onClick={() => setConfirmar({ tipo: 'conservar', id: p.id })}
                      >
                        Conservar este
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmar({ tipo: 'eliminar', id: p.id })}
                      >
                        Eliminar
                      </Button>
                    </div>
                  )}
                </li>
            )
          })}
        </ul>
      )}

      <Modal open={nuevo} onClose={() => setNuevo(false)} title="Nuevo peritaje" size="xl">
        <PeritajeForm
          guardando={crear.isPending}
          onGuardar={(data) => crear.mutate(data, { onSuccess: () => setNuevo(false) })}
        />
      </Modal>

      <Modal
        open={Boolean(verId)}
        onClose={() => { setVerId(null); setEditando(false) }}
        title={editando ? 'Editar peritaje' : 'Peritaje'}
        size="xl"
      >
        {editando && seleccionado ? (
          <PeritajeForm
            inicial={seleccionado}
            guardando={actualizar.isPending}
            onGuardar={(data) => actualizar.mutate({ id: verId, data }, { onSuccess: () => setEditando(false) })}
          />
        ) : seleccionado ? (
          <div className="space-y-4">
            <PeritajeLectura peritaje={seleccionado} />
            <div className="flex justify-end">
              <Button variant="glass" icon={Pencil} onClick={() => setEditando(true)}>
                Editar
              </Button>
            </div>
          </div>
        ) : (
          <Spinner size={20} />
        )}
      </Modal>

      <Modal
        open={Boolean(confirmar)}
        onClose={() => setConfirmar(null)}
        title={confirmar?.tipo === 'conservar' ? 'Conservar este peritaje' : 'Eliminar peritaje'}
      >
        <p className="text-sm text-ink-2">
          {confirmar?.tipo === 'conservar'
            ? `Se conserva este peritaje y se eliminan los otros ${peritajes.length - 1}. Esta acción no se puede deshacer.`
            : 'Se elimina este peritaje definitivamente. Esta acción no se puede deshacer.'}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmar(null)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={confirmarAccion}>
            Confirmar
          </Button>
        </div>
      </Modal>

      <GlassCard className="p-5">
        <h3 className="mb-4 font-display text-sm font-bold text-ink">Documentación</h3>
        <FotoMultiSlot
          label="Foto del seguro"
          slot="seguro"
          vehiculoId={vehiculoId}
          vehiculo={vehiculo}
        />
      </GlassCard>
    </div>
  )
}

const TABS_VALIDOS = ['resumen', 'peritaje', 'gestoria', 'historial']

export default function VehiculoDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { data: v, isLoading } = useVehiculo(id)
  const { cambiarEstado, eliminar } = useVehiculoMutations()
  const { esAdmin } = useCrmPerfil()

  const tab = TABS_VALIDOS.includes(params.get('tab')) ? params.get('tab') : 'resumen'
  const setTab = (t) => setParams((p) => {
    t === 'resumen' ? p.delete('tab') : p.set('tab', t)
    return p
  }, { replace: true })

  if (isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner size={28} />
      </div>
    )
  }
  if (!v) return <p className="text-ink-3">Vehículo no encontrado.</p>

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/crm/vehiculos')} className="flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={16} /> Vehículos
      </button>
      <h1 className="font-display text-2xl font-bold text-ink">
        {v.marca} {v.modelo}
      </h1>

      <Tabs value={tab} onValueChange={setTab} className="crm-root">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="peritaje">Peritaje</TabsTrigger>
          <TabsTrigger value="gestoria">Gestoría</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="pt-4">
          <FichaVehiculo
            vehiculo={v}
            puedeEliminar={esAdmin}
            onCambiarEstado={(e) => cambiarEstado.mutate({ id, de: v.estado, a: e })}
            onEliminar={() => eliminar.mutate(id, { onSuccess: () => navigate('/crm/vehiculos') })}
          />
        </TabsContent>

        <TabsContent value="peritaje" className="pt-4">
          <PeritajePanel vehiculoId={id} vehiculo={v} esAdmin={esAdmin} />
        </TabsContent>

        <TabsContent value="gestoria" className="pt-4">
          <GestoriaChecklist vehiculoId={id} vehiculo={v} />
        </TabsContent>

        <TabsContent value="historial" className="pt-4">
          <HistorialTimeline entidad="vehiculo" entidadId={id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
