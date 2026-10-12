import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import * as svc from '@/crm/services/vehiculos.service'

/**
 * Acciones masivas sobre vehículos para /crm/vehiculos.
 *
 * Contrato:
 * - `cambiarEstadoMasivo.mutate({ items, a })` donde `items` es un array de
 *   `{ id, de }` (`de` = estado anterior real de cada vehículo) y `a` el
 *   estado destino. Llama a `cambiarEstado(id, de, a, autorId)` por cada item.
 * - `actualizarMasivo.mutate({ ids, data })`: llama a
 *   `actualizar(id, data, autorId)` por cada id.
 * - `eliminarMasivo.mutate(ids)`: llama a `eliminar(id)` por cada id.
 *
 * Cada mutación usa `Promise.allSettled` e invalida
 * `['crm', 'vehiculos']` y `['crm', 'vehiculo']` cuando al menos un item
 * tuvo éxito (aunque sea parcial).
 */
export function useVehiculosBulk() {
  const qc = useQueryClient()
  const { id: autorId } = useCrmPerfil()
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['crm', 'vehiculos'] })
    qc.invalidateQueries({ queryKey: ['crm', 'vehiculo'] })
  }

  const resumir = (settled) => {
    const ok = settled.filter((r) => r.status === 'fulfilled').length
    return { ok, total: settled.length, fallos: settled.length - ok }
  }

  const errorTotal = (settled, fallback) => {
    const primero = settled.find((r) => r.status === 'rejected')
    return new Error(primero?.reason?.message ?? fallback)
  }

  const cambiarEstadoMasivo = useMutation({
    mutationFn: async ({ items, a }) => {
      if (!Array.isArray(items) || items.length === 0) throw new Error('Seleccioná al menos un vehículo.')
      const settled = await Promise.allSettled(items.map(({ id, de }) => svc.cambiarEstado(id, de, a, autorId)))
      const resumen = resumir(settled)
      if (resumen.ok === 0) throw errorTotal(settled, 'No se pudo actualizar ningún vehículo.')
      return resumen
    },
    onSuccess: ({ ok, total, fallos }) => {
      invalidar()
      if (fallos === 0) toast.success(`Se actualizaron ${ok} vehículos.`)
      else toast.warning(`${ok} de ${total} actualizados (${fallos} fallaron).`)
    },
    onError: (e) => toast.error(e.message),
  })

  const actualizarMasivo = useMutation({
    mutationFn: async ({ ids, data }) => {
      if (!Array.isArray(ids) || ids.length === 0) throw new Error('Seleccioná al menos un vehículo.')
      const settled = await Promise.allSettled(ids.map((id) => svc.actualizar(id, data, autorId)))
      const resumen = resumir(settled)
      if (resumen.ok === 0) throw errorTotal(settled, 'No se pudo actualizar ningún vehículo.')
      return resumen
    },
    onSuccess: ({ ok, total, fallos }) => {
      invalidar()
      if (fallos === 0) toast.success(`Se actualizaron ${ok} vehículos.`)
      else toast.warning(`${ok} de ${total} actualizados (${fallos} fallaron).`)
    },
    onError: (e) => toast.error(e.message),
  })

  const eliminarMasivo = useMutation({
    mutationFn: async (ids) => {
      if (!Array.isArray(ids) || ids.length === 0) throw new Error('Seleccioná al menos un vehículo.')
      const settled = await Promise.allSettled(ids.map((id) => svc.eliminar(id)))
      const resumen = resumir(settled)
      if (resumen.ok === 0) throw errorTotal(settled, 'No se pudo eliminar ningún vehículo.')
      return resumen
    },
    onSuccess: ({ ok, total, fallos }) => {
      invalidar()
      if (fallos === 0) toast.success(`Se eliminaron ${ok} vehículos.`)
      else toast.warning(`${ok} de ${total} eliminados (${fallos} fallaron).`)
    },
    onError: (e) => toast.error(e.message),
  })

  return { cambiarEstadoMasivo, actualizarMasivo, eliminarMasivo }
}
