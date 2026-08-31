const nf = new Intl.NumberFormat('es-AR')

export const CANAL_OPCIONES = [
  { id: 'salon', label: 'Salón' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'ya_cliente', label: 'Ya cliente' },
  { id: 'web', label: 'Web' },
  { id: 'otro', label: 'Otro' },
]

const CANAL_LABEL = Object.fromEntries(CANAL_OPCIONES.map((o) => [o.id, o.label]))
export const canalLabel = (canal) => CANAL_LABEL[canal] ?? canal ?? '—'

/** "Nissan Kicks · SUV · 2017–2020 · hasta $30.000.000" — omite lo ausente. */
export function lineaInteres(c) {
  const partes = []
  const mm = [c.marca_interes, c.modelo_interes].filter(Boolean).join(' ')
  if (mm) partes.push(mm)
  if (c.tipo_interes) partes.push(c.tipo_interes)
  if (c.anio_min || c.anio_max) partes.push(`${c.anio_min ?? '…'}–${c.anio_max ?? '…'}`)
  if (c.presupuesto) partes.push(`hasta $${nf.format(c.presupuesto)}`)
  if (c.interes_cero_km) partes.push('0 km')
  return partes.length ? partes.join(' · ') : '—'
}

export function statusVariant(status) {
  return { activo: 'green', en_seguimiento: 'amber', vendido: 'neutral', perdido: 'red' }[status] ?? 'neutral'
}
