import LeadVehiculos from '@/components/crm/LeadVehiculos'
import { useClienteMutations } from '@/crm/hooks/useClientes'

/** Autos en entrega del cliente (CRM nuevo): mismo editor con listado que en
 *  los leads, más el campo Transmisión que ya existía acá. */
export default function AutosEntregaCliente({ clienteId, autos = [] }) {
  const { agregarAutoEntrega, quitarAutoEntrega } = useClienteMutations(clienteId)

  return (
    <LeadVehiculos
      items={autos}
      conTransmision
      pending={agregarAutoEntrega.isPending}
      emptyText="Sin autos en entrega."
      onAgregar={(item) => agregarAutoEntrega.mutate(item)}
      onQuitar={(i) => quitarAutoEntrega.mutate(autos[i]?.id)}
    />
  )
}
