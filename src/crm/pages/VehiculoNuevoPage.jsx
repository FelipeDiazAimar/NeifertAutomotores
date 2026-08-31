import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import GlassCard from '@/components/common/GlassCard'
import { useVehiculoMutations } from '@/crm/hooks/useVehiculos'
import VehiculoForm from '@/crm/components/VehiculoForm'

export default function VehiculoNuevoPage() {
  const navigate = useNavigate()
  const { crear } = useVehiculoMutations()

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={16} /> Volver
      </button>
      <h1 className="font-display text-2xl font-bold text-ink">Cargar vehículo</h1>
      <GlassCard className="p-6">
        <VehiculoForm
          guardando={crear.isPending}
          onGuardar={(data) =>
            crear.mutate(data, {
              onSuccess: (fila) => navigate(`/crm/vehiculos/${fila.id}`),
            })
          }
        />
      </GlassCard>
    </div>
  )
}
