/** Catálogo de vistas top-level del CRM y resolución de permisos por rol. */

export const VISTAS = [
  { key: 'panel', label: 'Panel', ruta: '/crm' },
  { key: 'clientes', label: 'Clientes', ruta: '/crm/clientes' },
  { key: 'vehiculos', label: 'Vehículos', ruta: '/crm/vehiculos' },
  { key: 'tareas', label: 'Tareas', ruta: '/crm/tareas' },
  { key: 'usuarios', label: 'Usuarios', ruta: '/crm/usuarios' },
  { key: 'roles', label: 'Roles', ruta: '/crm/roles' },
]

export const ROL_LABEL = { admin: 'Admin', dueno: 'Dueño', vendedor: 'Vendedor' }

/** Vista a la que pertenece una ruta, o null si no tiene gate (login,
 *  cambiar-password, cualquier otra). */
export function vistaDeRuta(pathname) {
  if (pathname === '/crm' || pathname === '/crm/') return 'panel'
  for (const v of VISTAS) {
    if (v.key === 'panel') continue
    if (pathname === v.ruta || pathname.startsWith(v.ruta + '/')) return v.key
  }
  return null
}

/** Vistas efectivas de un usuario: su override, o las por defecto de su rol. */
export function vistasEfectivas(usuario, rolesMap = {}) {
  if (Array.isArray(usuario?.vistas_override)) return usuario.vistas_override
  return rolesMap[usuario?.rol]?.vistas_default ?? []
}

/** Primera ruta de VISTAS cuya key esté habilitada, o null. */
export function primeraRutaPermitida(vistas = []) {
  const set = new Set(vistas)
  return VISTAS.find((v) => set.has(v.key))?.ruta ?? null
}
