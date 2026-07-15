import { supabase, isSupabaseConfigured } from './supabaseClient'

/** Login del panel admin — reutiliza el login real del CRM viejo
 *  (neifertcrm.com) como única fuente de verdad de usuario/contraseña.
 *
 *  1) Valida user/pass contra su login.php real (vía proxy, por CORS).
 *  2) Si Supabase está configurado, además "canjea" ese login por una sesión
 *     real de Supabase Auth (necesaria para que las políticas RLS de
 *     escritura funcionen) usando una cuenta puente 1-a-1 por usuario del
 *     CRM viejo — el servidor la crea/reutiliza y no expone la service role
 *     key al navegador.
 *  3) Si Supabase NO está configurado (aún en modo demo), devuelve
 *     directamente {nombre, role} para que el AuthProvider arme una sesión
 *     local — sin necesitar Supabase para probar el login real ya mismo. */
export async function loginWithCrmCredentials(user, pass) {
  let loginRes
  try {
    const r = await fetch('/api/crm/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, pass }),
    })
    loginRes = await r.json()
  } catch {
    return { ok: false, error: 'Error de conexión con el CRM. Intentá de nuevo.' }
  }

  if (!loginRes?.ok) {
    return { ok: false, error: loginRes?.error || 'Usuario o contraseña incorrectos.' }
  }

  const { nombre, role } = loginRes.data

  if (!isSupabaseConfigured) {
    return { ok: true, nombre, role, bridged: false }
  }

  try {
    const bridgeRes = await fetch('/api/crm/bridge-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, nombre, role }),
    })
    const bridge = await bridgeRes.json()
    if (!bridge?.ok) return { ok: false, error: bridge?.error || 'No se pudo iniciar la sesión.' }

    const { error } = await supabase.auth.verifyOtp({
      token_hash: bridge.token,
      type: 'magiclink',
    })
    if (error) return { ok: false, error: error.message }

    return { ok: true, nombre, role, bridged: true }
  } catch {
    return { ok: false, error: 'Error al abrir la sesión. Intentá de nuevo.' }
  }
}
