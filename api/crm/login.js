import { crmLogin } from '../../src/server/crmCore.js'

/** Vercel Serverless Function — equivalente en producción de
 *  src/plugins/crmProxy.js (que solo corre en `vite dev`).
 *
 * POST /api/crm/login  body: { user, pass }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  try {
    const { user, pass } = req.body || {}
    const { status, json } = await crmLogin(user, pass)
    res.status(status).json(json)
  } catch (e) {
    console.error('[crm-proxy] login:', e.message)
    res.status(502).json({ ok: false, error: 'Error de conexión con el CRM.' })
  }
}
