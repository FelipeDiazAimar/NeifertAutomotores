import { useEventos } from './useEventos.js'

/** Wrapper histórico — el historial de un vehículo. */
export const useEventosVehiculo = (vehiculoId) => useEventos('vehiculo', vehiculoId)
