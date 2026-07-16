import { supabase, isSupabaseConfigured } from './supabaseClient'

/** Usuarios de muestra para cuando no hay Supabase configurado (modo demo). */
const DEMO_USERS = [
  {
    id: 'u1',
    full_name: 'Marcos Neifert',
    role: 'admin',
    crm_user: 'mneifert',
    created_at: '2024-01-15',
    avatar_url: null,
  },
  {
    id: 'u2',
    full_name: 'Ana García',
    role: 'vendedor',
    crm_user: 'agarcia',
    created_at: '2024-03-20',
    avatar_url: null,
  },
]

const toAppUser = (row) => ({
  id: row.id,
  full_name: row.nombre_completo,
  role: row.rol,
  avatar_url: row.foto_url,
  crm_user: row.usuario_crm,
  created_at: row.creado_en,
})

/** Usuarios reales del panel: son las cuentas puente creadas al iniciar
 *  sesión con credenciales del CRM viejo (no hay alta/login nativo por
 *  email+contraseña — el CRM viejo es la única fuente de identidad). */
export async function fetchUsers() {
  if (!isSupabaseConfigured) return DEMO_USERS
  const { data, error } = await supabase.from('perfiles').select('*').order('creado_en')
  if (error) throw error
  return data.map(toAppUser)
}

/** Elimina la cuenta de acceso de un usuario (vía función serverless, service
 *  role — no se puede hacer desde el cliente anon). No revoca su login en el
 *  CRM viejo: si vuelve a entrar con credenciales válidas, se le recrea la
 *  cuenta puente en el próximo login. */
export async function deleteUser(userId) {
  if (!isSupabaseConfigured) return { id: userId }
  const res = await fetch('/api/admin/delete-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || 'No se pudo eliminar el usuario.')
  return json
}
