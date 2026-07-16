import { deleteUserAccount } from '../server/usersCore.js'

/**
 * Plugin de Vite que expone la gestión de usuarios del panel admin en el
 * servidor de desarrollo. La lógica real vive en src/server/usersCore.js
 * (compartida con la función serverless de producción en api/admin/*.js).
 *
 * POST /api/admin/delete-user  body: { userId }
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

export function usersProxyPlugin({ supabaseUrl, supabaseServiceRoleKey } = {}) {
  return {
    name: 'admin-users-proxy',
    configureServer(server) {
      server.middlewares.use('/api/admin/delete-user', async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
        try {
          const { userId } = await readJsonBody(req)
          const result = await deleteUserAccount({ supabaseUrl, supabaseServiceRoleKey, userId })
          sendJson(res, 200, { ok: true, ...result })
        } catch (e) {
          console.error('[users-proxy] delete-user:', e.message)
          sendJson(res, 500, { ok: false, error: e.message })
        }
      })
    },
  }
}
