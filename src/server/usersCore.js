import { createClient } from '@supabase/supabase-js'

/**
 * Gestión de usuarios del panel admin, sin dependencias de Vite ni Vercel,
 * para poder llamarse desde el plugin de dev (src/plugins/usersProxy.js) y
 * desde la función serverless de producción (api/admin/delete-user.js).
 *
 * Requiere la service role key: eliminar la cuenta de Auth de otra persona
 * no se puede hacer con el cliente anon del navegador.
 */

function adminClient(supabaseUrl, supabaseServiceRoleKey) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el servidor para gestionar usuarios.')
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Elimina la cuenta de Auth de un usuario (el perfil se borra solo, en
 *  cascada). Esto NO revoca su acceso al CRM viejo: si vuelve a loguearse
 *  acá con credenciales válidas del CRM, se le crea una cuenta puente nueva
 *  — el control de acceso real vive en el CRM viejo, no en esta tabla. */
export async function deleteUserAccount({ supabaseUrl, supabaseServiceRoleKey, userId }) {
  if (!userId) throw new Error('Falta el id del usuario a eliminar.')
  const admin = adminClient(supabaseUrl, supabaseServiceRoleKey)
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) throw error
  return { id: userId }
}
