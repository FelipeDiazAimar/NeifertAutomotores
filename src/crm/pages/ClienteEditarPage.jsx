import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import GlassCard from '@/components/common/GlassCard'
import Spinner from '@/components/common/Spinner'
import { useCliente, useClienteMutations } from '@/crm/hooks/useClientes'
import ClienteForm from '@/crm/components/ClienteForm'

const CAMPOS = [
  'nombre', 'telefono', 'localidad', 'fecha_cumple', 'canal',
  'marca_interes', 'modelo_interes', 'tipo_interes', 'trans_interes',
  'anio_min', 'anio_max', 'presupuesto', 'notas', 'interes_cero_km',
]

export default function ClienteEditarPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: cliente, isLoading } = useCliente(id)
  const { actualizar } = useClienteMutations(id)

  if (isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner size={28} />
      </div>
    )
  }
  if (!cliente) return <p className="text-ink-3">Cliente no encontrado.</p>

  const inicial = Object.fromEntries(CAMPOS.map((k) => [k, cliente[k] ?? undefined]))

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <button onClick={() => navigate(`/crm/clientes/${id}`)} className="flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={16} /> Volver
      </button>
      <h1 className="font-display text-2xl font-bold text-ink">Editar {cliente.nombre}</h1>
      <GlassCard className="p-6">
        <ClienteForm
          inicial={inicial}
          guardando={actualizar.isPending}
          onGuardar={(data) => actualizar.mutate({ id, data }, { onSuccess: () => navigate(`/crm/clientes/${id}`) })}
        />
      </GlassCard>
    </div>
  )
}
