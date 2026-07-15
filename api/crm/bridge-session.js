import { bridgeCrmSession } from '../../src/server/crmCore.js'

/** Vercel Serverless Function — equivalente en producción de
 *  src/plugins/crmProxy.js (que solo corre en `vite dev`).
 *
 * POST /api/crm/bridge-session  body: { user, nombre, role }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  try {
    const { user, nombre, role } = req.body || {}
    const result = await bridgeCrmSession({
      supabaseUrl: process.env.VITE_SUPABASE_URL,
      supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      user,
      nombre,
      role,
    })
    res.status(200).json({ ok: true, ...result })
  } catch (e) {
    console.error('[crm-proxy] bridge-session:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
}
