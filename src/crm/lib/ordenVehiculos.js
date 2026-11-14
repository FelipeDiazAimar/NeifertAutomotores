/** Órdenes de la lista de vehículos del CRM: las mismas opciones que el
 *  catálogo público (id compartido), traducidas a { campo, dir } de la
 *  consulta. "Relevancia" ordena por el ranking manual de /crm/relevancias. */
export const ORDENES_VEHICULOS = [
  { id: 'relevance', label: 'Relevancia', orden: { campo: 'orden_relevancia', dir: 'asc' } },
  { id: 'brand-asc', label: 'Marca A-Z', orden: { campo: 'marca', dir: 'asc' } },
  { id: 'model-asc', label: 'Modelo A-Z', orden: { campo: 'modelo', dir: 'asc' } },
  { id: 'year-desc', label: 'Más nuevos', orden: { campo: 'anio', dir: 'desc' } },
  { id: 'km-asc', label: 'Menos km', orden: { campo: 'km', dir: 'asc' } },
]

/** Id de la opción que corresponde a `orden`, o null si no coincide con ninguna. */
export function idDeOrden(orden) {
  return (
    ORDENES_VEHICULOS.find((o) => o.orden.campo === orden?.campo && o.orden.dir === orden?.dir)?.id ??
    null
  )
}
