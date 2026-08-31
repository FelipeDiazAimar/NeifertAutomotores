import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Spinner from '@/components/common/Spinner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useCliente, useClienteMutations } from '@/crm/hooks/useClientes'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import FichaCliente from '@/crm/components/FichaCliente'
import InteresesCliente from '@/crm/components/InteresesCliente'
import AutosEntregaCliente from '@/crm/components/AutosEntregaCliente'
import SeguimientoCliente from '@/crm/components/SeguimientoCliente'
import RegistrarVentaModal from '@/crm/components/RegistrarVentaModal'
import HistorialTimeline from '@/crm/components/HistorialTimeline'

export default function ClienteDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: c, isLoading } = useCliente(id)
  const { cambiarStatus, archivar, eliminar } = useClienteMutations(id)
  const { esAdmin } = useCrmPerfil()
  const [abrirVenta, setAbrirVenta] = useState(false)

  if (isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner size={28} />
      </div>
    )
  }
  if (!c) return <p className="text-ink-3">Cliente no encontrado.</p>

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <button onClick={() => navigate('/crm/clientes')} className="flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={16} /> Clientes
      </button>
      <h1 className="font-display text-2xl font-bold text-ink">{c.nombre}</h1>

      <Tabs defaultValue="datos" className="crm-root">
        <TabsList>
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="intereses">Intereses</TabsTrigger>
          <TabsTrigger value="autos">Autos en entrega</TabsTrigger>
          <TabsTrigger value="seguimiento">Seguimiento</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="datos" className="pt-4">
          <FichaCliente
            cliente={c}
            puedeEliminar={esAdmin}
            onCambiarStatus={(s) => cambiarStatus.mutate({ id, de: c.status, a: s })}
            onArchivar={() => archivar.mutate(id, { onSuccess: () => navigate('/crm/clientes') })}
            onEliminar={() => eliminar.mutate(id, { onSuccess: () => navigate('/crm/clientes') })}
            onRegistrarVenta={() => setAbrirVenta(true)}
          />
        </TabsContent>

        <TabsContent value="intereses" className="pt-4">
          <InteresesCliente clienteId={id} intereses={c.intereses ?? []} />
        </TabsContent>

        <TabsContent value="autos" className="pt-4">
          <AutosEntregaCliente clienteId={id} autos={c.autos_entrega ?? []} />
        </TabsContent>

        <TabsContent value="seguimiento" className="pt-4">
          <SeguimientoCliente clienteId={id} />
        </TabsContent>

        <TabsContent value="historial" className="pt-4">
          <HistorialTimeline entidad="cliente" entidadId={id} />
        </TabsContent>
      </Tabs>

      <RegistrarVentaModal clienteId={id} open={abrirVenta} onClose={() => setAbrirVenta(false)} />
    </div>
  )
}
