import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import Button from '@/components/common/Button'
import Spinner from '@/components/common/Spinner'
import GlassCard from '@/components/common/GlassCard'
import Modal from '@/components/common/Modal'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useVehiculo, useVehiculoMutations } from '@/crm/hooks/useVehiculos'
import { usePeritajes, usePeritaje, usePeritajeMutations } from '@/crm/hooks/usePeritajes'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import FichaVehiculo from '@/crm/components/FichaVehiculo'
import FotosUploader from '@/crm/components/FotosUploader'
import PeritajeForm from '@/crm/components/PeritajeForm'
import PeritajeLectura from '@/crm/components/PeritajeLectura'
import GestoriaChecklist from '@/crm/components/GestoriaChecklist'
import HistorialTimeline from '@/crm/components/HistorialTimeline'
import EstadoStrip from '@/crm/components/EstadoStrip'

const fmtFecha = (f) => (f ? new Date(f).toLocaleDateString('es-AR') : '—')

function PeritajePanel({ vehiculoId }) {
  const { data: peritajes = [], isLoading } = usePeritajes(vehiculoId)
  const { crear } = usePeritajeMutations(vehiculoId)
  const [nuevo, setNuevo] = useState(false)
  const [verId, setVerId] = useState(null)
  const { data: seleccionado } = usePeritaje(verId)

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button icon={Plus} onClick={() => setNuevo(true)}>
          Nuevo peritaje
        </Button>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-8">
          <Spinner size={24} />
        </div>
      ) : peritajes.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-3">Sin peritajes cargados.</p>
      ) : (
        <ul className="space-y-2">
          {peritajes.map((p) => (
            <li key={p.id}>
              <GlassCard as="button" onClick={() => setVerId(p.id)} className="flex w-full items-center gap-4 p-3 text-left">
                <div className="w-28 shrink-0">
                  <EstadoStrip ok={p.items_ok} obs={p.items_obs} falta={p.items_falta} />
                </div>
                <div className="flex-1 text-sm">
                  <span className="font-semibold text-ink">{fmtFecha(p.fecha)}</span>
                  <span className="text-ink-3"> · {p.peritador?.nombre ?? '—'}</span>
                </div>
                <span className="text-xs text-ink-3">
                  {p.costo_total ? `$ ${new Intl.NumberFormat('es-AR').format(p.costo_total)}` : ''}
                </span>
              </GlassCard>
            </li>
          ))}
        </ul>
      )}

      <Modal open={nuevo} onClose={() => setNuevo(false)} title="Nuevo peritaje">
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <PeritajeForm
            guardando={crear.isPending}
            onGuardar={(data) => crear.mutate(data, { onSuccess: () => setNuevo(false) })}
          />
        </div>
      </Modal>

      <Modal open={Boolean(verId)} onClose={() => setVerId(null)} title="Peritaje">
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          {seleccionado ? <PeritajeLectura peritaje={seleccionado} /> : <Spinner size={20} />}
        </div>
      </Modal>
    </div>
  )
}

export default function VehiculoDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: v, isLoading } = useVehiculo(id)
  const { cambiarEstado, archivar, eliminar } = useVehiculoMutations()
  const { esAdmin } = useCrmPerfil()

  if (isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner size={28} />
      </div>
    )
  }
  if (!v) return <p className="text-ink-3">Vehículo no encontrado.</p>

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <button onClick={() => navigate('/crm/vehiculos')} className="flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={16} /> Vehículos
      </button>
      <h1 className="font-display text-2xl font-bold text-ink">
        {v.marca} {v.modelo}
      </h1>

      <Tabs defaultValue="resumen" className="crm-root">
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
            onArchivar={() => archivar.mutate(id, { onSuccess: () => navigate('/crm/vehiculos') })}
            onEliminar={() => eliminar.mutate(id, { onSuccess: () => navigate('/crm/vehiculos') })}
          />
          <GlassCard className="mt-4 p-5">
            <h3 className="mb-3 font-display text-sm font-bold text-ink">Fotos</h3>
            <FotosUploader vehiculoId={id} />
          </GlassCard>
        </TabsContent>

        <TabsContent value="peritaje" className="pt-4">
          <PeritajePanel vehiculoId={id} />
        </TabsContent>

        <TabsContent value="gestoria" className="pt-4">
          <GestoriaChecklist vehiculoId={id} />
        </TabsContent>

        <TabsContent value="historial" className="pt-4">
          <HistorialTimeline vehiculoId={id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
