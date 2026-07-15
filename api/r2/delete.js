import { createR2Client, deleteR2Object } from '../../src/server/r2Core.js'

const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT, R2_PUBLIC_URL } = process.env
const configured = Boolean(R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME && R2_ENDPOINT && R2_PUBLIC_URL)
const client = configured
  ? createR2Client({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, endpoint: R2_ENDPOINT })
  : null

/** Vercel Serverless Function — equivalente en producción de
 *  src/plugins/r2Proxy.js (que solo corre en `vite dev`).
 *
 * POST /api/r2/delete  body: { url }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  if (!configured) {
    return res.status(501).json({ ok: false, error: 'Cloudflare R2 no configurado en el servidor.' })
  }
  try {
    const { url } = req.body || {}
    const result = await deleteR2Object(client, { bucket: R2_BUCKET_NAME, url, publicUrlBase: R2_PUBLIC_URL })
    res.status(200).json(result)
  } catch (e) {
    console.error('[r2-proxy] delete:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
}
