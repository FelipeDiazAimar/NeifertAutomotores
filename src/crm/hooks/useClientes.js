import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import * as svc from '@/crm/services/clientes.service'

export function useClientes(opts) {
  return useQuery({
    queryKey: ['crm', 'clientes', opts],
    queryFn: () => svc.listar(opts),
    keepPreviousData: true,
  })
}

export function useCliente(id) {
  return useQuery({
    queryKey: ['crm', 'cliente', id],
    queryFn: () => svc.obtener(id),
    enabled: Boolean(id),
  })
}

const errMsg = (e) =>
  e.message.includes('permission') ? 'No tenés permiso para esta acción.' : e.message

export function useClienteMutations(clienteId) {
  const qc = useQueryClient()
  const { id: autorId } = useCrmPerfil()

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['crm', 'clientes'] })
    qc.invalidateQueries({ queryKey: ['crm', 'cliente', clienteId] })
    qc.invalidateQueries({ queryKey: ['crm', 'eventos', 'cliente', clienteId] })
  }
  const ok = (msg) => () => {
    invalidar()
    if (msg) toast.success(msg)
  }
  const fail = (e) => toast.error(errMsg(e))

  const crear = useMutation({ mutationFn: (data) => svc.crear(data, autorId), onSuccess: ok('Cliente cargado.'), onError: fail })
  const actualizar = useMutation({ mutationFn: ({ id, data }) => svc.actualizar(id, data, autorId), onSuccess: ok('Cambios guardados.'), onError: fail })
  const cambiarStatus = useMutation({ mutationFn: ({ id, de, a }) => svc.cambiarStatus(id, de, a, autorId), onSuccess: ok(), onError: fail })
  const archivar = useMutation({ mutationFn: (id) => svc.archivar(id, autorId), onSuccess: ok('Cliente archivado.'), onError: fail })
  const desarchivar = useMutation({ mutationFn: (id) => svc.desarchivar(id, autorId), onSuccess: ok(), onError: fail })
  const eliminar = useMutation({ mutationFn: (id) => svc.eliminar(id), onSuccess: ok('Cliente eliminado.'), onError: fail })
  const registrarVenta = useMutation({
    mutationFn: ({ vehiculoId, estadoVehiculo }) => svc.registrarVenta(clienteId, vehiculoId, estadoVehiculo, autorId),
    onSuccess: ok('Venta registrada.'),
    onError: fail,
  })
  const agregarInteres = useMutation({ mutationFn: (data) => svc.agregarInteres(clienteId, data), onSuccess: ok(), onError: fail })
  const quitarInteres = useMutation({ mutationFn: (id) => svc.quitarInteres(id), onSuccess: ok(), onError: fail })
  const agregarAutoEntrega = useMutation({ mutationFn: (data) => svc.agregarAutoEntrega(clienteId, data), onSuccess: ok(), onError: fail })
  const quitarAutoEntrega = useMutation({ mutationFn: (id) => svc.quitarAutoEntrega(id), onSuccess: ok(), onError: fail })
  const agregarContacto = useMutation({ mutationFn: (texto) => svc.agregarContacto(clienteId, texto, autorId), onSuccess: ok('Contacto agregado.'), onError: fail })

  return {
    crear, actualizar, cambiarStatus, archivar, desarchivar, eliminar,
    registrarVenta, agregarInteres, quitarInteres, agregarAutoEntrega, quitarAutoEntrega, agregarContacto,
  }
}
