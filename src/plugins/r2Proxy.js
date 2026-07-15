import { createR2Client, presignR2Upload, deleteR2Object } from '../server/r2Core.js'

/**
 * Plugin de Vite que expone el proxy de Cloudflare R2 en el servidor de
 * desarrollo. La lógica real vive en src/server/r2Core.js (compartida con
 * las funciones serverless de producción en api/r2/*.js).
 *
 * POST /api/r2/presign  body: { filename, contentType }
 *   -> { ok:true, uploadUrl, publicUrl } | { ok:false, error }
 * POST /api/r2/delete  body: { url }
 *   -> { ok:true } | { ok:false, error }
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

export function r2ProxyPlugin({ accessKeyId, secretAccessKey, bucket, endpoint, publicUrlBase } = {}) {
  const configured = Boolean(accessKeyId && secretAccessKey && bucket && endpoint && publicUrlBase)
  const client = configured ? createR2Client({ accessKeyId, secretAccessKey, endpoint }) : null

  return {
    name: 'r2-proxy',
    configureServer(server) {
      server.middlewares.use('/api/r2/presign', async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
        if (!configured) {
          return sendJson(res, 501, {
            ok: false,
            error: 'Cloudflare R2 no configurado en el servidor (faltan R2_* en .env).',
          })
        }
        try {
          const { filename, contentType } = await readJsonBody(req)
          const result = await presignR2Upload(client, { bucket, filename, contentType, publicUrlBase })
          sendJson(res, 200, { ok: true, ...result })
        } catch (e) {
          console.error('[r2-proxy] presign:', e.message)
          sendJson(res, 500, { ok: false, error: e.message })
        }
      })

      server.middlewares.use('/api/r2/delete', async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
        if (!configured) {
          return sendJson(res, 501, { ok: false, error: 'Cloudflare R2 no configurado en el servidor.' })
        }
        try {
          const { url } = await readJsonBody(req)
          const result = await deleteR2Object(client, { bucket, url, publicUrlBase })
          sendJson(res, 200, result)
        } catch (e) {
          console.error('[r2-proxy] delete:', e.message)
          sendJson(res, 500, { ok: false, error: e.message })
        }
      })
    },
  }
}
