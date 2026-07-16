import { mergeAndSaveInstagramItems } from '../server/instagramCore.js'

/**
 * Plugin de Vite — equivalente en dev de api/instagram/report-sync.js.
 * Deja probar el agente/ejecutable contra `npm run dev` antes de apuntarlo
 * a producción.
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

function validItem(it, r2PublicUrl) {
  if (!it || typeof it.id !== 'string' || !/^ig-\d+$/.test(it.id)) return false
  if (it.type !== 'image' && it.type !== 'video') return false
  if (typeof it.url !== 'string') return false
  if (r2PublicUrl && !it.url.startsWith(r2PublicUrl.replace(/\/$/, ''))) return false
  return true
}

export function instagramReportSyncProxyPlugin({
  supabaseUrl,
  supabaseServiceRoleKey,
  agentToken,
  r2PublicUrl,
} = {}) {
  return {
    name: 'instagram-report-sync-proxy',
    configureServer(server) {
      server.middlewares.use('/api/instagram/report-sync', async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
        if (agentToken && req.headers['x-agent-token'] !== agentToken) {
          return sendJson(res, 401, { ok: false, error: 'Token inválido.' })
        }
        try {
          const body = await readJsonBody(req)
          const items = Array.isArray(body.items) ? body.items.filter((it) => validItem(it, r2PublicUrl)) : []
          const result = await mergeAndSaveInstagramItems({ supabaseUrl, supabaseServiceRoleKey, newItems: items })
          sendJson(res, 200, { ok: true, ...result })
        } catch (e) {
          console.error('[instagram-report-sync-proxy]', e.message)
          sendJson(res, 500, { ok: false, error: e.message })
        }
      })
    },
  }
}
