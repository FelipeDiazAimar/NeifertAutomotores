import { formatDistanceToNowStrict, format } from 'date-fns'
import { es } from 'date-fns/locale'

const nf = new Intl.NumberFormat('es-AR')

/** 245000 -> "U$S 245.000" */
export function formatUSD(value) {
  if (value == null) return '—'
  return `U$S ${nf.format(Math.round(value))}`
}

/** Precio en su moneda original (sin conversión): (145000, 'USD') -> "U$S 145.000";
 *  (23000000, 'ARS') -> "AR$ 23.000.000". Sin monto cargado -> "Consultar precio". */
export function formatPrice(amount, currency = 'USD') {
  if (amount == null) return 'Consultar precio'
  const prefix = currency === 'ARS' ? 'AR$' : 'U$S'
  return `${prefix} ${nf.format(Math.round(amount))}`
}

/** Precio de un vehículo mostrado en su moneda original. Compatible con
 *  vehículos previos que solo tienen price_usd (sin price_amount/currency). */
export function formatVehiclePrice(vehicle) {
  const amount = vehicle?.price_amount ?? vehicle?.price_usd ?? null
  const currency = vehicle?.currency || 'USD'
  return formatPrice(amount, currency)
}

/** 1200 -> "1.200 km"; 0 -> "0 km" */
export function formatKm(value) {
  if (value == null) return '—'
  return `${nf.format(Math.round(value))} km`
}

/** 45200 -> "45,2k" · 1_200_000 -> "1,2M" (para KPIs compactos) */
export function formatCompact(value) {
  if (value == null) return '—'
  if (Math.abs(value) >= 1_000_000)
    return (value / 1_000_000).toFixed(1).replace('.', ',') + 'M'
  if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1).replace('.', ',') + 'k'
  return String(value)
}

/** Tiempo relativo corto: "10 min", "2 h", "3 d" */
export function formatRelative(date) {
  if (!date) return ''
  return formatDistanceToNowStrict(new Date(date), { locale: es, addSuffix: false })
}

/** Fecha legible: "24 oct, 10:30" */
export function formatDateTime(date) {
  if (!date) return ''
  return format(new Date(date), "d MMM, HH:mm", { locale: es })
}

/** Porcentaje con signo: 5.2 -> "+5,2%" */
export function formatDelta(value) {
  if (value == null) return ''
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toString().replace('.', ',')}%`
}
