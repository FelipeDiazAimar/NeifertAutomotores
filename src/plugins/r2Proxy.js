import { createR2Client, presignR2Upload, deleteR2Object, listR2Objects } from '../server/r2Core.js'

/**
 * Plugin de Vite que expone el proxy de Cloudflare R2 en el servidor de
 * desarrollo. La lógica real vive en src/server/r2Core.js (compartida con
 * las funciones serverless de producción en api/r2/*.js).
 *
 * POST /api/r2/presign  body: { filename, contentType }
 *   -> { ok:true, uploadUrl, publicUrl } | { ok:false, error }
 * POST /api/r2/delete  body: { url }
 *   -> { ok:true } | { ok:false, error }
 * GET  /api/r2/stats   -> { ok:true, imageCount, imageSize, videoCount, videoSize, ... }
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

export function r2ProxyPlugin({ accessKeyId, secretAccessKey, bucket, endpoint, publicUrlBase, storageLimitGB } = {}) {
  const configured = Boolean(accessKeyId && secretAccessKey && bucket && endpoint && publicUrlBase)
  const client = configured ? createR2Client({ accessKeyId, secretAccessKey, endpoint }) : null
  const limitBytes = (storageLimitGB || 10) * 1024 * 1024 * 1024

  let cachedTotalSize = null
  let cacheExpiry = 0

  async function getTotalSize() {
    if (cachedTotalSize !== null && Date.now() < cacheExpiry) return cachedTotalSize
    const objects = await listR2Objects(client, { bucket })
    cachedTotalSize = objects.reduce((sum, o) => sum + o.size, 0)
    cacheExpiry = Date.now() + 60_000
    return cachedTotalSize
  }

  function bumpCache(bytes) {
    if (cachedTotalSize !== null) cachedTotalSize += bytes
  }

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
          const { filename, contentType, fileSize } = await readJsonBody(req)
          const currentSize = await getTotalSize()
          const incoming = fileSize || 0
          if (currentSize + incoming > limitBytes * 0.95) {
            return sendJson(res, 413, {
              ok: false,
              error: 'Límite de almacenamiento alcanzado. No se pueden subir más archivos.',
              totalSize: currentSize,
              limitBytes,
            })
          }
          const result = await presignR2Upload(client, { bucket, filename, contentType, publicUrlBase })
          bumpCache(incoming)
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
          if (result.ok) cachedTotalSize = null
          sendJson(res, 200, result)
        } catch (e) {
          console.error('[r2-proxy] delete:', e.message)
          sendJson(res, 500, { ok: false, error: e.message })
        }
      })

      server.middlewares.use('/api/r2/stats', async (req, res) => {
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
        if (!configured) {
          return sendJson(res, 501, { ok: false, error: 'Cloudflare R2 no configurado en el servidor.' })
        }
        try {
          const objects = await listR2Objects(client, { bucket })

          const imageExts = /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)$/i
          const videoExts = /\.(mp4|webm|mov|avi|mkv|ogg|m4v)$/i

          let imageCount = 0, imageSize = 0
          let videoCount = 0, videoSize = 0
          let otherCount = 0, otherSize = 0

          for (const obj of objects) {
            if (imageExts.test(obj.key)) { imageCount++; imageSize += obj.size }
            else if (videoExts.test(obj.key)) { videoCount++; videoSize += obj.size }
            else { otherCount++; otherSize += obj.size }
          }

          const totalSize = imageSize + videoSize + otherSize

          sendJson(res, 200, {
            ok: true,
            imageCount, imageSize,
            videoCount, videoSize,
            otherCount, otherSize,
            totalObjects: objects.length,
            totalSize,
            limitBytes,
          })
        } catch (e) {
          console.error('[r2-proxy] stats:', e.message)
          sendJson(res, 500, { ok: false, error: e.message })
        }
      })
    },
  }
}
