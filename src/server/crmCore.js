/**
 * Lógica del proxy del CRM viejo (neifertcrm.com), sin dependencias de Vite
 * ni Vercel, para poder llamarse desde el plugin de dev
 * (src/plugins/crmProxy.js) y desde las funciones serverless de producción
 * (api/crm/*.js).
 */

const CRM_BASE = 'https://neifertcrm.com/backend/api'
// API pública dedicada (token estático, sin login) para la integración con
// el sitio: stock disponible + leads generados desde la web. Provista por
// el equipo del CRM viejo — ver api/crm/vehiculos.js y api/crm/leads.js.
const CRM_EXT_BASE = 'https://neifertcrm.com/backend/api/public'

/** Login real contra el CRM viejo. Devuelve el JSON tal cual responde su API.
 *  Se usa solo para la cuenta de sincronización de la cartera de clientes
 *  (`fetchCrmClientes`) — la sincronización de vehículos/leads usa la API
 *  pública (más abajo). */
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

function extHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

// --- Cartera completa de clientes (panel interno, NO es la API pública) ---
// Requiere login de empleado (igual que antes se usaba para sincronizar
// vehículos). clientes.php no forma parte de lo que nos dieron oficialmente;
// se usa con credenciales de un empleado real (autorizado por el dueño del
// negocio), igual que cualquier persona del salón accedería a esos datos.

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

/** Devuelve un token válido de la cuenta de sincronización, logueando de
 *  nuevo si no hay uno cacheado o está por vencer. */
async function getSyncToken(user, pass) {
  const now = Date.now() / 1000
  if (SYNC_TOKEN_CACHE.token && SYNC_TOKEN_CACHE.exp - now > 60) {
    return SYNC_TOKEN_CACHE.token
  }
  const { json } = await crmLogin(user, pass)
  if (!json?.ok) throw new Error(json?.error || 'Login de la cuenta de sincronización del CRM falló.')
  const token = json.data.token
  const payload = decodeJwtPayload(token)
  SYNC_TOKEN_CACHE.token = token
  SYNC_TOKEN_CACHE.exp = payload?.exp || now + 15 * 60
  return token
}

/** Cartera completa de clientes/leads del CRM viejo (panel interno de
 *  empleados) — trae `canal` (salón/whatsapp/instagram/...) que la API
 *  pública no expone. */
export async function fetchCrmClientes({ syncUser, syncPass }) {
  const token = await getSyncToken(syncUser, syncPass)
  const r = await fetch(`${CRM_BASE}/clientes.php`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!r.ok) throw new Error(`clientes.php respondió ${r.status}`)
  return unwrapList(await r.json())
}

/** Normaliza la respuesta de la API pública: puede venir como array crudo o
 *  envuelta en { data: [...] } / { ok, data }. */
function unwrapList(json) {
  if (Array.isArray(json)) return json
  if (Array.isArray(json?.data)) return json.data
  return []
}

/** Stock disponible del CRM viejo (API pública, token estático). */
export async function fetchExtVehiculos(token) {
  const r = await fetch(`${CRM_EXT_BASE}/vehiculos.php`, {
    headers: extHeaders(token),
    signal: AbortSignal.timeout(15000),
  })
  if (!r.ok) throw new Error(`vehiculos.php respondió ${r.status}`)
  return unwrapList(await r.json())
}

/** Empuja un lead nuevo (generado en nuestro sitio) al CRM viejo.
 *  Devuelve { id } tal cual responde su API. */
export async function createExtLead(token, { name, phone, notes, brand, model }) {
  const r = await fetch(`${CRM_EXT_BASE}/leads.php`, {
    method: 'POST',
    headers: extHeaders(token),
    body: JSON.stringify({ name, phone, notes, brand, model }),
    signal: AbortSignal.timeout(10000),
  })
  const json = await r.json().catch(() => null)
  if (!r.ok) throw new Error(json?.error || `leads.php (POST) respondió ${r.status}`)
  return json
}

/** Leads que nosotros mismos empujamos con createExtLead (no la cartera
 *  completa del CRM viejo — su API pública no expone eso). Sirve como
 *  verificación de que la sincronización está funcionando. */
export async function fetchExtWebLeads(token) {
  const r = await fetch(`${CRM_EXT_BASE}/leads.php`, {
    headers: extHeaders(token),
    signal: AbortSignal.timeout(15000),
  })
  if (!r.ok) throw new Error(`leads.php (GET) respondió ${r.status}`)
  return unwrapList(await r.json())
}

