import { createR2Client, listR2Objects } from '../../src/server/r2Core.js'

const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT, R2_PUBLIC_URL, R2_STORAGE_LIMIT_GB } = process.env
const configured = Boolean(R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME && R2_ENDPOINT && R2_PUBLIC_URL)
const client = configured
  ? createR2Client({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, endpoint: R2_ENDPOINT })
  : null
const limitBytes = (parseInt(R2_STORAGE_LIMIT_GB || '0') || 10) * 1024 * 1024 * 1024

const imageExts = /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)$/i
const videoExts = /\.(mp4|webm|mov|avi|mkv|ogg|m4v)$/i

/** Vercel Serverless Function — equivalente en producción de
 *  src/plugins/r2Proxy.js (que solo corre en `vite dev`).
 *
 * GET /api/r2/stats -> { ok:true, imageCount, imageSize, videoCount, videoSize, ... }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  if (!configured) {
    return res.status(501).json({ ok: false, error: 'Cloudflare R2 no configurado en el servidor.' })
  }
  try {
    const objects = await listR2Objects(client, { bucket: R2_BUCKET_NAME })

    let imageCount = 0, imageSize = 0
    let videoCount = 0, videoSize = 0
    let otherCount = 0, otherSize = 0

    for (const obj of objects) {
      if (imageExts.test(obj.key)) { imageCount++; imageSize += obj.size }
      else if (videoExts.test(obj.key)) { videoCount++; videoSize += obj.size }
      else { otherCount++; otherSize += obj.size }
    }

    const totalSize = imageSize + videoSize + otherSize

    res.status(200).json({
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
    res.status(500).json({ ok: false, error: e.message })
  }
}
