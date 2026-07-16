import { createClient } from '@supabase/supabase-js'

/**
 * Lógica del proxy del CRM viejo (neifertcrm.com), sin dependencias de Vite
 * ni Vercel, para poder llamarse desde el plugin de dev
 * (src/plugins/crmProxy.js) y desde las funciones serverless de producción
 * (api/crm/*.js).
 */

const CRM_BASE = 'https://neifertcrm.com/backend/api'

// Cache del token de la cuenta de servicio (se refresca cerca de expirar).
// Vive mientras el proceso/lambda esté "caliente".
const SYNC_TOKEN_CACHE = { token: null, exp: 0 }

/** Decodifica el payload de un JWT sin verificar la firma (ya confiamos en
 *  el login.php real, esto es solo para leer el `exp`). */
function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1]
    const json = Buffer.from(payload, 'base64url').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

/** Login real contra el CRM viejo. Devuelve el JSON tal cual responde su API. */
export async function crmLogin(user, pass) {
  const r = await fetch(`${CRM_BASE}/auth/login.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, pass }),
    signal: AbortSignal.timeout(10000),
  })
  const json = await r.json()
  return { status: r.ok ? 200 : r.status, json }
}

/** Devuelve un token válido de la cuenta de servicio, logueando de nuevo si
 *  no hay uno cacheado o está por vencer. */
async function getSyncToken(user, pass) {
  const now = Date.now() / 1000
  if (SYNC_TOKEN_CACHE.token && SYNC_TOKEN_CACHE.exp - now > 60) {
    return SYNC_TOKEN_CACHE.token
  }
  const { json } = await crmLogin(user, pass)
  if (!json?.ok) throw new Error(json?.error || 'Login de la cuenta de servicio del CRM falló.')
  const token = json.data.token
  const payload = decodeJwtPayload(token)
  SYNC_TOKEN_CACHE.token = token
  SYNC_TOKEN_CACHE.exp = payload?.exp || now + 15 * 60
  return token
}

/** Trae vehiculos.php autenticado con la cuenta de servicio. */
export async function fetchCrmVehiculos({ syncUser, syncPass }) {
  const token = await getSyncToken(syncUser, syncPass)
  const r = await fetch(`${CRM_BASE}/vehiculos.php`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  })
  return r.json()
}

/** Email estable por usuario del CRM viejo, para crear/encontrar siempre la
 *  misma cuenta puente en Supabase Auth (no es un email real, solo un id). */
function crmShadowEmail(user) {
  return `${String(user).toLowerCase().replace(/[^a-z0-9]/g, '')}@crm-viejo.neifert.local`
}

/** Crea/encuentra la cuenta puente en Supabase Auth para ese usuario del CRM
 *  viejo y devuelve un token de un solo uso (magic link) para verifyOtp. */
export async function bridgeCrmSession({ supabaseUrl, supabaseServiceRoleKey, user, nombre, role }) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el servidor para crear la sesión puente.')
  }
  const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const email = crmShadowEmail(user)

  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (listErr) throw listErr
  let userId = list.users.find((u) => u.email === email)?.id

  if (!userId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { nombre_completo: nombre, rol: role, crm_user: user },
    })
    if (createErr) throw createErr
    userId = created.user.id
  }

  // Mantiene el perfil al día con lo que dice el CRM viejo (nombre/rol/usuario)
  await admin
    .from('perfiles')
    .upsert({ id: userId, nombre_completo: nombre, rol: role, usuario_crm: user }, { onConflict: 'id' })

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (linkErr) throw linkErr

  return { email, token: link.properties?.hashed_token }
}
