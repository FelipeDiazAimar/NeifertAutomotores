import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import GlassCard from '@/components/common/GlassCard'
import Spinner from '@/components/common/Spinner'
import { useVehiculo, useVehiculoMutations } from '@/crm/hooks/useVehiculos'
import VehiculoForm from '@/crm/components/VehiculoForm'

// Campos que el form maneja (no metemos id/auditoría/estado en el update).
const CAMPOS = [
  'marca', 'modelo', 'version', 'patente', 'tipo', 'anio', 'km', 'transmision', 'color',
  'moneda', 'precio_contado', 'precio_canje', 'duenio_nombre', 'duenio_apellido',
  'duenio_contacto', 'itv', 'itv_venc', 'consignacion', 'tipo_consignacion', 'origen',
  'carpeta_completa', 'carpeta_con_oficio', 'carpeta_entregada', 'tiene_iva', 'nota',
]

export default function VehiculoEditarPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: vehiculo, isLoading } = useVehiculo(id)
  const { actualizar } = useVehiculoMutations()

  if (isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner size={28} />
      </div>
    )
  }
  if (!vehiculo) return <p className="text-ink-3">Vehículo no encontrado.</p>

  const inicial = Object.fromEntries(CAMPOS.map((k) => [k, vehiculo[k] ?? undefined]))

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <button onClick={() => navigate(`/crm/vehiculos/${id}`)} className="flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={16} /> Volver
      </button>
      <h1 className="font-display text-2xl font-bold text-ink">
        Editar {vehiculo.marca} {vehiculo.modelo}
      </h1>
      <GlassCard className="p-6">
        <VehiculoForm
          inicial={inicial}
          guardando={actualizar.isPending}
          onGuardar={(data) =>
            actualizar.mutate({ id, data }, { onSuccess: () => navigate(`/crm/vehiculos/${id}`) })
          }
        />
      </GlassCard>
    </div>
  )
}
