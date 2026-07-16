import { runInstagramSync } from '../server/instagramCore.js'

/**
 * Plugin de Vite, SOLO para dev — no tiene equivalente en api/*.js para
 * producción, a propósito: Instagram bloquea el scraping desde IPs de
 * datacenter (como las de Vercel), así que esto tiene que correr desde una
 * compu real. El botón "Actualizar Instagram" de /admin/contenido pega acá.
 *
 * POST /api/instagram/sync → corre runInstagramSync() (modo incremental)
 */

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(payload))
}

export function instagramSyncProxyPlugin({
  supabaseUrl,
  supabaseServiceRoleKey,
  r2AccessKeyId,
  r2SecretAccessKey,
  r2Bucket,
  r2Endpoint,
  r2PublicUrl,
} = {}) {
  return {
    name: 'instagram-sync-proxy',
    configureServer(server) {
      server.middlewares.use('/api/instagram/sync', async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
        const missing = [
          ['SUPABASE_URL', supabaseUrl],
          ['SUPABASE_SERVICE_ROLE_KEY', supabaseServiceRoleKey],
          ['R2_ACCESS_KEY_ID', r2AccessKeyId],
          ['R2_SECRET_ACCESS_KEY', r2SecretAccessKey],
          ['R2_BUCKET_NAME', r2Bucket],
          ['R2_ENDPOINT', r2Endpoint],
          ['R2_PUBLIC_URL', r2PublicUrl],
        ]
          .filter(([, v]) => !v)
          .map(([k]) => k)
        if (missing.length) {
          return sendJson(res, 501, { ok: false, error: `Faltan estas variables en .env: ${missing.join(', ')}` })
        }
        try {
          const result = await runInstagramSync({
            supabaseUrl,
            supabaseServiceRoleKey,
            r2AccessKeyId,
            r2SecretAccessKey,
            r2Bucket,
            r2Endpoint,
            r2PublicUrl,
            onProgress: (msg) => console.log('[instagram-sync]', msg),
          })
          sendJson(res, 200, { ok: true, ...result })
        } catch (e) {
          console.error('[instagram-sync-proxy]', e.message)
          sendJson(res, 500, { ok: false, error: e.message })
        }
      })
    },
  }
}
