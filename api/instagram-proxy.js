import { fetchInstagramPage } from '../src/server/instagramCore.js'

/** Vercel Serverless Function — equivalente en producción de
 *  src/plugins/instagramProxy.js (que solo corre en `vite dev`).
 *
 * GET /api/instagram-proxy          → primera página (24 posts)
 * GET /api/instagram-proxy?after=X  → página siguiente (cursor X)
 */
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')

  const after = req.query?.after ?? null

  try {
    const page = await fetchInstagramPage(after)
    res.status(200).json(page)
  } catch (err) {
    console.error('[instagram-proxy] Error:', err.message)
    res.status(502).json({ error: err.message })
  }
}
