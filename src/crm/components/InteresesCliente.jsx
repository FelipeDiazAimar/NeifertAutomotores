import LeadVehiculos from '@/components/crm/LeadVehiculos'
import { useClienteMutations } from '@/crm/hooks/useClientes'

/** Vehículos de interés del cliente (CRM nuevo): mismo editor con listado
 *  que en los leads — varios vehículos con condición, marca, modelo,
 *  versión, año, color, km y notas. */
export default function InteresesCliente({ clienteId, intereses = [] }) {
  const { agregarInteres, quitarInteres } = useClienteMutations(clienteId)

  return (
    <LeadVehiculos
      items={intereses}
      pending={agregarInteres.isPending}
      emptyText="Sin intereses cargados."
      onAgregar={(item) => agregarInteres.mutate(item)}
      onQuitar={(i) => quitarInteres.mutate(intereses[i]?.id)}
    />
  )
}
