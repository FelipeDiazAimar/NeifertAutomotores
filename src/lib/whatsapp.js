import { formatVehiclePrice, formatKm } from './formatters'

/** Limpia un telefono dejando solo digitos (formato wa.me). */
export function cleanPhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

/** Construye un link de wa.me con un mensaje ya preparado. */
export function waLink(phone, message) {
  const p = cleanPhone(phone)
  const text = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/${p}${text}`
}

export const GENERAL_INQUIRY_MESSAGE =
  'Hola! Me gustaria recibir asesoramiento de Neifert Automotores. Estoy buscando un vehiculo y queria conocer opciones disponibles.'

export const CONTACT_INQUIRY_MESSAGE =
  'Hola! Me comunico desde la web de Neifert Automotores. Queria hacer una consulta sobre vehiculos disponibles y formas de compra.'

/** Mensaje con toda la info del vehiculo, dejando lugar a la consulta del cliente. */
export function vehicleMessage(vehicle, { origin } = {}) {
  if (!vehicle) return GENERAL_INQUIRY_MESSAGE
  const lines = [
    `Hola! Vi este vehiculo en la web de Neifert Automotores y me interesa recibir mas informacion:`,
    ``,
    `Auto: ${vehicle.brand} ${vehicle.model}${vehicle.version ? ` ${vehicle.version}` : ''} (${vehicle.year})`,
    `Precio: ${formatVehiclePrice(vehicle)}`,
    `Datos: ${formatKm(vehicle.km)} - ${vehicle.fuel_type}${
      vehicle.transmission ? ` - ${vehicle.transmission}` : ''
    }`,
  ]
  if (vehicle.engine) lines.push(`Motor: ${vehicle.engine}`)
  if (origin && vehicle.id) lines.push(`Link: ${origin}/catalogo/${vehicle.id}`)
  lines.push(
    ``,
    `Me podrian confirmar si sigue disponible y contarme condiciones de pago, entrega y permuta? Gracias.`
  )
  return lines.join('\n')
}

/** Link de WhatsApp para consultar por un vehiculo concreto.
 *  `customMessage` reemplaza el mensaje armado (p. ej. "quiero uno similar"). */
export function vehicleWaLink(phone, vehicle, customMessage) {
  if (customMessage) return waLink(phone, customMessage)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return waLink(phone, vehicleMessage(vehicle, { origin }))
}

/** Mensaje generico para coordinar una cita. */
export function appointmentMessage(detail) {
  const base =
    'Hola! Queria coordinar una visita al salon de Neifert Automotores para ver opciones y recibir asesoramiento.'
  return detail ? `${base}\n\n${detail}` : base
}

export function similarVehicleMessage(vehicle, statusLabel) {
  const title = vehicle
    ? `${vehicle.brand} ${vehicle.model}${vehicle.version ? ` ${vehicle.version}` : ''} (${vehicle.year})`
    : 'una unidad publicada'
  const status = statusLabel ? ` figura como ${statusLabel.toLowerCase()}` : ' no esta disponible'
  return `Hola! Vi el ${title} en la web de Neifert Automotores y${status}. Me gustaria que me asesoren con opciones similares disponibles.`
}

export function vehicleOfferMessage(vehicle, { origin } = {}) {
  if (!vehicle) {
    return 'Hola! Te escribo de Neifert Automotores. Tengo algunas opciones disponibles que pueden interesarte.'
  }

  const lines = [
    `Hola! Te escribo de Neifert Automotores.`,
    ``,
    `Tengo esta unidad disponible que puede interesarte:`,
    ``,
    `${vehicle.brand} ${vehicle.model}${vehicle.version ? ` ${vehicle.version}` : ''} (${vehicle.year})`,
    `Precio: ${formatVehiclePrice(vehicle)}`,
    `Datos: ${formatKm(vehicle.km)} - ${vehicle.fuel_type}${
      vehicle.transmission ? ` - ${vehicle.transmission}` : ''
    }`,
  ]

  if (vehicle.engine) lines.push(`Motor: ${vehicle.engine}`)
  if (origin && vehicle.id) lines.push(`Link: ${origin}/catalogo/${vehicle.id}`)
  lines.push(
    ``,
    `Si te sirve, puedo pasarte mas informacion, fotos o coordinar una visita para verlo.`
  )

  return lines.join('\n')
}

export function leadFollowUpMessage(lead) {
  const name = lead?.full_name ? ` ${lead.full_name}` : ''
  const vehicle = lead?.vehicle_interest
    ? ` por tu consulta sobre ${lead.vehicle_interest}`
    : ' por tu consulta'
  return `Hola${name}, te contacto de Neifert Automotores${vehicle}. Queria saber si todavia estas interesado/a y ayudarte con la informacion que necesites.`
}
