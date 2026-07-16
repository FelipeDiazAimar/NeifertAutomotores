import { deleteUserAccount } from '../../src/server/usersCore.js'

/** Vercel Serverless Function — equivalente en producción de
 *  src/plugins/usersProxy.js (que solo corre en `vite dev`).
 *
 * POST /api/admin/delete-user  body: { userId }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  try {
    const { userId } = req.body || {}
    const result = await deleteUserAccount({
      supabaseUrl: process.env.VITE_SUPABASE_URL,
      supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      userId,
    })
    res.status(200).json({ ok: true, ...result })
  } catch (e) {
    console.error('[admin] delete-user:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
}
