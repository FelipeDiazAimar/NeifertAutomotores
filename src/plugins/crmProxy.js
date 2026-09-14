import {
  fetchExtVehiculos,
  createExtLead,
  fetchExtWebLeads,
  fetchCrmClientes,
} from '../server/crmCore.js'

/**
 * Plugin de Vite que expone el proxy del CRM viejo en el servidor de
 * desarrollo. La lógica real vive en src/server/crmCore.js (compartida con
 * las funciones serverless de producción en api/crm/*.js).
 *
 * GET  /api/crm/vehiculos      → stock disponible (API pública, token estático)
 * GET  /api/crm/leads          → leads que empujamos nosotros (verificación)
 * POST /api/crm/leads          → empuja un lead nuevo del sitio
 * GET  /api/crm/clientes       → cartera completa (panel interno, login de empleado)
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

export function crmProxyPlugin({
  crmExtApiToken,
  crmSyncUser,
  crmSyncPass,
} = {}) {
  return {
    name: 'crm-viejo-proxy',
    configureServer(server) {
      server.middlewares.use('/api/crm/clientes', async (_req, res) => {
        if (!crmSyncUser || !crmSyncPass) {
          return sendJson(res, 501, {
            ok: false,
            error: 'Falta CRM_SYNC_USER/CRM_SYNC_PASS en el servidor para sincronizar clientes.',
          })
        }
        try {
          const data = await fetchCrmClientes({ syncUser: crmSyncUser, syncPass: crmSyncPass })
          sendJson(res, 200, { ok: true, data })
        } catch (e) {
          console.error('[crm-proxy] clientes:', e.message)
          sendJson(res, 502, { ok: false, error: e.message })
        }
      })

      server.middlewares.use('/api/crm/sync-legacy', async (req, res) => {
        const { handleSyncLegacy } = await import('../../api/crm/sync-legacy.js')
        const shim = {
          setHeader: (k, v) => res.setHeader(k, v),
          status: (c) => {
            res.statusCode = c
            return shim
          },
          json: (b) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(b))
          },
          end: (b) => res.end(b),
        }
        await handleSyncLegacy(req, shim)
      })

      server.middlewares.use('/api/crm/seed-usuarios', async (req, res) => {
        const { handleSeedUsuarios } = await import('../../api/crm/seed-usuarios.js')
        const body = req.method === 'POST' ? await readJsonBody(req).catch(() => ({})) : {}
        const shim = {
          setHeader: (k, v) => res.setHeader(k, v),
          status: (c) => {
            res.statusCode = c
            return shim
          },
          json: (b) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(b))
          },
          end: (b) => res.end(b),
        }
        await handleSeedUsuarios({ ...req, body }, shim)
      })

      server.middlewares.use('/api/crm/usuarios', async (req, res) => {
        const { handleUsuarios } = await import('../../api/crm/usuarios.js')
        const body = req.method === 'POST' ? await readJsonBody(req).catch(() => ({})) : {}
        const shim = {
          setHeader: (k, v) => res.setHeader(k, v),
          status: (c) => {
            res.statusCode = c
            return shim
          },
          json: (b) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(b))
          },
          end: (b) => res.end(b),
        }
        await handleUsuarios({ ...req, body }, shim)
      })

      server.middlewares.use('/api/crm/vehiculos', async (_req, res) => {
        if (!crmExtApiToken) {
          return sendJson(res, 501, {
            ok: false,
            error: 'Falta CRM_EXT_API_TOKEN en el servidor para sincronizar vehículos.',
          })
        }
        try {
          const data = await fetchExtVehiculos(crmExtApiToken)
          sendJson(res, 200, { ok: true, data })
        } catch (e) {
          console.error('[crm-proxy] vehiculos:', e.message)
          sendJson(res, 502, { ok: false, error: e.message })
        }
      })

      server.middlewares.use('/api/crm/leads', async (req, res) => {
        if (!crmExtApiToken) {
          return sendJson(res, 501, { ok: false, error: 'Falta CRM_EXT_API_TOKEN en el servidor.' })
        }
        if (req.method === 'GET') {
          try {
            const data = await fetchExtWebLeads(crmExtApiToken)
            return sendJson(res, 200, { ok: true, data })
          } catch (e) {
            console.error('[crm-proxy] leads (GET):', e.message)
            return sendJson(res, 502, { ok: false, error: e.message })
          }
        }
        if (req.method === 'POST') {
          try {
            const { name, phone, notes, brand, model } = await readJsonBody(req)
            if (!name || !phone) return sendJson(res, 400, { ok: false, error: 'Faltan name/phone.' })
            const result = await createExtLead(crmExtApiToken, { name, phone, notes, brand, model })
            return sendJson(res, 200, { ok: true, ...result })
          } catch (e) {
            console.error('[crm-proxy] leads (POST):', e.message)
            return sendJson(res, 502, { ok: false, error: e.message })
          }
        }
        sendJson(res, 405, { ok: false, error: 'Method not allowed' })
      })

    },
  }
}
