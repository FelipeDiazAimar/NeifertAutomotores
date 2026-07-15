import { crmLogin, fetchCrmVehiculos, bridgeCrmSession } from '../server/crmCore.js'

/**
 * Plugin de Vite que expone el proxy del CRM viejo en el servidor de
 * desarrollo. La lógica real vive en src/server/crmCore.js (compartida con
 * las funciones serverless de producción en api/crm/*.js).
 *
 * GET  /api/crm/vehiculos      → login interno (cacheado) + vehiculos.php
 * POST /api/crm/login          → valida usuario/contraseña contra el login real
 * POST /api/crm/bridge-session → crea/encuentra la cuenta puente en Supabase
 *                                 Auth y devuelve un token de un solo uso
 */

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

export function crmProxyPlugin({ supabaseUrl, supabaseServiceRoleKey, crmSyncUser, crmSyncPass } = {}) {
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
          const json = await fetchCrmVehiculos({ syncUser: crmSyncUser, syncPass: crmSyncPass })
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
          const { status, json } = await crmLogin(user, pass)
          sendJson(res, status, json)
        } catch (e) {
          console.error('[crm-proxy] login:', e.message)
          sendJson(res, 502, { ok: false, error: 'Error de conexión con el CRM.' })
        }
      })

      server.middlewares.use('/api/crm/bridge-session', async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
        try {
          const { user, nombre, role } = await readJsonBody(req)
          const result = await bridgeCrmSession({ supabaseUrl, supabaseServiceRoleKey, user, nombre, role })
          sendJson(res, 200, { ok: true, ...result })
        } catch (e) {
          console.error('[crm-proxy] bridge-session:', e.message)
          sendJson(res, 500, { ok: false, error: e.message })
        }
      })
    },
  }
}
