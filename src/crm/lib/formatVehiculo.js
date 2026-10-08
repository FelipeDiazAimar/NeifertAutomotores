const nf = new Intl.NumberFormat('es-AR')

/** "2015 · 128.000 km · Manual" — omite los campos ausentes. */
export function lineaSpecs(v) {
  const partes = []
  if (v.anio) partes.push(String(v.anio))
  if (v.km != null && v.km !== '') partes.push(`${nf.format(v.km)} km`)
  if (v.transmision) partes.push(v.transmision)
  return partes.length ? partes.join(' · ') : '—'
}

/** { monto: "12.500", moneda: "USD" } — monto "—" si no hay precio. */
export function precioFmt(v) {
  const p = v.precio_contado
  return {
    monto: p == null || p === '' ? '—' : nf.format(p),
    moneda: v.moneda ?? 'ARS',
  }
}

/** variant de src/components/common/Badge para un estado de vehículo. */
export function estadoVariant(estado) {
  return { disponible: 'green', reservado: 'amber', vendido: 'neutral', baja: 'red' }[estado] ?? 'neutral'
}

/** Etiqueta con mayúscula inicial para un estado de vehículo. */
export const ESTADO_LABEL = {
  disponible: 'Disponible',
  reservado: 'Reservado',
  vendido: 'Vendido',
  baja: 'Baja',
}

export function estadoLabel(estado) {
  return ESTADO_LABEL[estado] ?? estado
}

export const NUEVO_VIGENCIA_MS = 14 * 24 * 60 * 60 * 1000

export function esNuevoVigente(v) {
  if (!v) return false
  if (!(v.is_new ?? v.es_nuevo ?? false)) return false
  const ref = v.es_nuevo_en ?? v.created_at ?? v.creado_en ?? null
  if (!ref) return true
  const t = new Date(ref).getTime()
  if (Number.isNaN(t)) return true
  return Date.now() - t < NUEVO_VIGENCIA_MS
}
