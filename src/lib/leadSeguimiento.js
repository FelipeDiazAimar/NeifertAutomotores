import { format } from 'date-fns'

// Fecha local (no UTC): de noche en Argentina toISOString ya da "mañana".
export const hoyISO = () => format(new Date(), 'yyyy-MM-dd')
export const tareaVacia = () => ({ titulo: '', fecha: hoyISO(), hora: '', prioridad: 'normal', asignado_a: '' })
export const alertaVacia = () => ({ titulo: '', fecha: hoyISO(), hora: '', asignado_a: '' })

/** A quién se le puede asignar: los usuarios activos, salvo la cuenta
 *  genérica "admin", que solo aparece si el que carga es ese mismo usuario. */
export function usuariosAsignables(usuarios = [], miId) {
  return usuarios.filter((u) => u.activo !== false && (u.id === miId || u.usuario !== 'admin'))
}

/** Valida lo cargado en el alta de un lead. Devuelve un mensaje de error o
 *  null. Un título vacío significa "no cargar nada". */
export function validarSeguimiento(tarea, alerta) {
  if (tarea.titulo.trim() && !tarea.fecha) return 'Elegí la fecha de la tarea.'
  if (alerta.titulo.trim()) {
    if (!alerta.fecha) return 'Elegí la fecha de la alerta.'
    if (!alerta.hora) return 'Elegí la hora de la alerta.'
  }
  return null
}
