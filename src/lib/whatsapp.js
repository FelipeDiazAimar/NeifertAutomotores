import { formatVehiclePrice, formatKm } from './formatters'

/** Limpia un teléfono dejando solo dígitos (formato wa.me). */
export function cleanPhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

/** Construye un link de wa.me con un mensaje ya preparado. */
export function waLink(phone, message) {
  const p = cleanPhone(phone)
  const text = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/${p}${text}`
}

/** Mensaje con toda la info del vehículo, dejando lugar a la consulta del cliente. */
export function vehicleMessage(vehicle, { origin } = {}) {
  if (!vehicle) return 'Hola! Quería hacer una consulta sobre un vehículo de Neifert Automotores.'
  const lines = [
    `Hola! Me interesa este vehículo de Neifert Automotores:`,
    ``,
    `🚗 ${vehicle.brand} ${vehicle.model}${vehicle.version ? ` ${vehicle.version}` : ''} (${vehicle.year})`,
    `💵 ${formatVehiclePrice(vehicle)}`,
    `📊 ${formatKm(vehicle.km)} · ${vehicle.fuel_type}${
      vehicle.transmission ? ` · ${vehicle.transmission}` : ''
    }`,
  ]
  if (vehicle.engine) lines.push(`⚙️ ${vehicle.engine}`)
  if (origin && vehicle.id) lines.push(`🔗 ${origin}/catalogo/${vehicle.id}`)
  lines.push(``, `¿Me podrían dar más información? Gracias.`)
  return lines.join('\n')
}

/** Link de WhatsApp para consultar por un vehículo concreto.
 *  `customMessage` reemplaza el mensaje armado (p. ej. "quiero uno similar"). */
export function vehicleWaLink(phone, vehicle, customMessage) {
  if (customMessage) return waLink(phone, customMessage)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return waLink(phone, vehicleMessage(vehicle, { origin }))
}

/** Mensaje genérico para coordinar una cita. */
export function appointmentMessage(detail) {
  const base = 'Hola! Quería coordinar una cita en Neifert Automotores.'
  return detail ? `${base}\n\n${detail}` : base
}
