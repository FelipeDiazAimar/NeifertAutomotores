/** Texto legible de un evento de la bitácora (crm.eventos). */
export function textoEvento(ev) {
  const quien = ev.usuario?.nombre ?? 'Alguien'
  const d = ev.datos ?? {}
  switch (ev.tipo) {
    case 'alta':
      return `${quien} cargó el vehículo`
    case 'edicion':
      return `${quien} editó ${d.campos?.length ? d.campos.join(', ') : 'el vehículo'}`
    case 'cambio_estado':
      return `${quien} cambió el estado de ${d.de} a ${d.a}`
    case 'peritaje':
      return `${quien} ${d.editado ? 'editó un' : 'cargó un'} peritaje`
    case 'gestoria':
      return `${quien} actualizó la gestoría`
    case 'archivado':
      return `${quien} ${d.archivado === false ? 'desarchivó' : 'archivó'} el vehículo`
    case 'foto':
      return `${quien} agregó una foto`
    default:
      return `${quien} — ${ev.tipo}`
  }
}
