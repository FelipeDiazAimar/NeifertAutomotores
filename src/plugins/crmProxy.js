import { createClient } from '@supabase/supabase-js'

/**
 * Proxy del CRM viejo (neifertcrm.com). Su API solo permite CORS desde su
 * propio origen, así que hay que pasar por un servidor (este plugin) en vez
 * de llamarla directo desde el navegador — mismo motivo que el proxy de
 * Instagram. Además, vehiculos.php exige `Authorization: Bearer <JWT>`
 * (aunque no sea visible en la sesión de un usuario ya logueado en su panel),
 * así que este proxy mantiene su propia sesión de "cuenta de servicio"
 * (CRM_SYNC_USER/CRM_SYNC_PASS) para poder sincronizar sin depender de que
 * haya un admin humano logueado en nuestro panel al mismo tiempo.
 *
 * GET  /api/crm/vehiculos      → login interno (cacheado) + vehiculos.php
 * POST /api/crm/login          → valida usuario/contraseña contra el login real
 * POST /api/crm/bridge-session → crea/encuentra la cuenta puente en Supabase
 *                                 Auth para ese usuario del CRM viejo y
 *                                 devuelve un token de un solo uso
 */

const CRM_BASE = 'https://neifertcrm.com/backend/api'

// Cache del token de la cuenta de servicio (se refresca cerca de expirar)
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

/** Devuelve un token válido de la cuenta de servicio, logueando de nuevo si
 *  no hay uno cacheado o está por vencer. */
async function getSyncToken(user, pass) {
  const now = Date.now() / 1000
  if (SYNC_TOKEN_CACHE.token && SYNC_TOKEN_CACHE.exp - now > 60) {
    return SYNC_TOKEN_CACHE.token
  }
  const r = await fetch(`${CRM_BASE}/auth/login.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, pass }),
    signal: AbortSignal.timeout(10000),
  })
  const json = await r.json()
  if (!json?.ok) throw new Error(json?.error || 'Login de la cuenta de servicio del CRM falló.')
  const token = json.data.token
  const payload = decodeJwtPayload(token)
  SYNC_TOKEN_CACHE.token = token
  SYNC_TOKEN_CACHE.exp = payload?.exp || now + 15 * 60
  return token
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(payload))
}

/** Email estable por usuario del CRM viejo, para crear/encontrar siempre la
 *  misma cuenta puente en Supabase Auth (no es un email real, solo un id). */
function crmShadowEmail(user) {
  return `${String(user).toLowerCase().replace(/[^a-z0-9]/g, '')}@crm-viejo.neifert.local`
}

export function crmProxyPlugin({
  supabaseUrl,
  supabaseServiceRoleKey,
  crmSyncUser,
  crmSyncPass,
} = {}) {
  const admin =
    supabaseUrl && supabaseServiceRoleKey
      ? createClient(supabaseUrl, supabaseServiceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null

  return {
    name: 'crm-viejo-proxy',
    configureServer(server) {
      server.middlewares.use('/api/crm/vehiculos', async (_req, res) => {
        if (!crmSyncUser || !crmSyncPass) {
          return sendJson(res, 501, {
            ok: false,
            error: 'Falta CRM_SYNC_USER/CRM_SYNC_PASS en el servidor para sincronizar vehículos.',
          })
        }
        try {
          const token = await getSyncToken(crmSyncUser, crmSyncPass)
          const r = await fetch(`${CRM_BASE}/vehiculos.php`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
          })
          const json = await r.json()
          sendJson(res, 200, json)
        } catch (e) {
          console.error('[crm-proxy] vehiculos:', e.message)
          sendJson(res, 502, { ok: false, error: e.message })
        }
      })

      server.middlewares.use('/api/crm/login', async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
        try {
          const { user, pass } = await readJsonBody(req)
          const r = await fetch(`${CRM_BASE}/auth/login.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user, pass }),
            signal: AbortSignal.timeout(10000),
          })
          const json = await r.json()
          sendJson(res, r.ok ? 200 : r.status, json)
        } catch (e) {
          console.error('[crm-proxy] login:', e.message)
          sendJson(res, 502, { ok: false, error: 'Error de conexión con el CRM.' })
        }
      })

      server.middlewares.use('/api/crm/bridge-session', async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
        if (!admin) {
          return sendJson(res, 501, {
            ok: false,
            error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor para crear la sesión puente.',
          })
        }
        try {
          const { user, nombre, role } = await readJsonBody(req)
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

          // Mantiene el perfil al día con lo que dice el CRM viejo (nombre/rol)
          await admin
            .from('perfiles')
            .upsert({ id: userId, nombre_completo: nombre, rol: role }, { onConflict: 'id' })

          const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
            type: 'magiclink',
            email,
          })
          if (linkErr) throw linkErr

          sendJson(res, 200, { ok: true, email, token: link.properties?.hashed_token })
        } catch (e) {
          console.error('[crm-proxy] bridge-session:', e.message)
          sendJson(res, 500, { ok: false, error: e.message })
        }
      })
    },
  }
}
