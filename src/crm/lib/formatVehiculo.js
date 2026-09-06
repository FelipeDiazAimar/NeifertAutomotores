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
