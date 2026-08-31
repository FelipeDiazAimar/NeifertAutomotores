import { supabase } from '@/services/supabaseClient'

const db = () => supabase.schema('crm')

/** Todos los usuarios del CRM, ordenados por nombre. */
export async function listar() {
  const { data, error } = await db()
    .from('usuarios')
    .select('id, usuario, nombre, rol, activo, vistas_override, creado_en')
    .order('nombre', { ascending: true })
  if (error) throw error
  return data ?? []
}

/** Vistas por defecto de cada rol. */
export async function roles() {
  const { data, error } = await db().from('roles').select('rol, vistas_default')
  if (error) throw error
  return data ?? []
}

/** Parche parcial de un usuario: { nombre?, rol?, activo?, vistas_override? }
 *  (vistas_override: string[] | null). */
export async function actualizarUsuario(id, parche) {
  const { error } = await db().from('usuarios').update(parche).eq('id', id)
  if (error) throw error
}

/** Guarda las vistas por defecto de un rol. */
export async function guardarRol(rol, vistas_default) {
  const { error } = await db()
    .from('roles')
    .upsert({ rol, vistas_default, actualizado_en: new Date().toISOString() }, { onConflict: 'rol' })
  if (error) throw error
}

/** Access token de la sesión actual (para autorizar el endpoint serverless). */
export async function tokenActual() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token ?? null
}

async function llamarEndpoint(body) {
  const token = await tokenActual()
  const res = await fetch('/api/crm/usuarios', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `Error ${res.status}`)
  }
  return json
}

/** Alta de usuario (crea el auth user + fila en crm.usuarios). */
export function crearUsuario({ usuario, nombre, rol, password }) {
  return llamarEndpoint({ accion: 'crear', usuario, nombre, rol, password })
}

/** Reset de contraseña de un usuario existente. */
export function resetPassword(id, password) {
  return llamarEndpoint({ accion: 'reset_password', id, password })
}
