// Los 8 trámites estándar de gestoría. Matchean las columnas
// crm.gestoria.<key>_hecho / _fecha / _nota / _por.
export const GESTORIA_ITEMS = [
  { key: 'form08', label: 'Formulario 08' },
  { key: 'verif_policial', label: 'Verificación policial' },
  { key: 'multas_nac', label: 'Multas nacionales' },
  { key: 'dominio_hist', label: 'Informe de dominio histórico' },
  { key: 'libre_deudas', label: 'Libre deuda de patente' },
  { key: 'titulo', label: 'Título' },
  { key: 'cedulas', label: 'Cédulas' },
  { key: 'identificacion', label: 'Verificación de autopartes' },
]

const soloFecha = (d) => new Date(d).toISOString().slice(0, 10)

/** Inicio y cierre de una gestoría. Si la fila no los tiene cargados (los
 *  registros migrados del CRM viejo no traían inicio/cierre), se derivan de las
 *  fechas de cada trámite: inicio = la más temprana, cierre = la más tardía
 *  cuando la gestoría está completa. */
export function fechasGestoria(g) {
  if (!g) return { inicio: null, cierre: null }
  const fechas = GESTORIA_ITEMS.map(({ key }) => g[`${key}_fecha`]).filter(Boolean).sort()
  const inicio = g.fecha_inicio ?? (fechas.length ? soloFecha(fechas[0]) : null)
  const cierre =
    g.fecha_cierre ??
    (g.estado === 'completo' && fechas.length ? soloFecha(fechas[fechas.length - 1]) : null)
  return { inicio, cierre }
}
