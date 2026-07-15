import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Proxy de Cloudflare R2 (storage tipo S3, 10GB gratis, egress gratis para
 * siempre — requiere tarjeta para habilitarlo pero no cobra dentro del free
 * tier).
 *
 * El navegador NUNCA ve las credenciales de R2: pide acá una URL firmada
 * (presigned PUT, válida unos minutos) y sube el archivo directo a R2 con esa
 * URL — el archivo no pasa por nuestro servidor, así video pesado no lo satura.
 *
 * POST /api/r2/presign  body: { filename, contentType }
 *   -> { ok:true, uploadUrl, publicUrl } | { ok:false, error }
 *
 * POST /api/r2/delete  body: { url }  (la URL pública devuelta al subir)
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
  const client = configured
    ? new S3Client({
        endpoint,
        region: 'auto',
        credentials: { accessKeyId, secretAccessKey },
      })
    : null

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
          if (!filename) throw new Error('Falta filename')
          const command = new PutObjectCommand({
            Bucket: bucket,
            Key: filename,
            ContentType: contentType || 'application/octet-stream',
          })
          const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 })
          const publicUrl = `${publicUrlBase.replace(/\/$/, '')}/${filename}`
          sendJson(res, 200, { ok: true, uploadUrl, publicUrl })
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
          const base = publicUrlBase.replace(/\/$/, '')
          if (!url || !url.startsWith(base)) {
            return sendJson(res, 200, { ok: false, error: 'La URL no pertenece a este bucket de R2.' })
          }
          const key = decodeURIComponent(url.slice(base.length + 1))
          await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
          sendJson(res, 200, { ok: true })
        } catch (e) {
          console.error('[r2-proxy] delete:', e.message)
          sendJson(res, 500, { ok: false, error: e.message })
        }
      })
    },
  }
}
