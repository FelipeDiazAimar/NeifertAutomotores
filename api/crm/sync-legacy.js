import { syncLegacyCrm } from '../../src/server/legacySync.js'

/** Vercel Serverless Function — sincroniza el clon del CRM viejo.
 *  Se dispara por Vercel Cron (ver vercel.json) con
 *  `Authorization: Bearer <CRON_SECRET>`. En `vite dev` la ruta la expone
 *  src/plugins/crmProxy.js.
 *
 * POST /api/crm/sync-legacy
 */
export async function handleSyncLegacy(req, res, { env = process.env, runner = syncLegacyCrm } = {}) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const expected = env.CRON_SECRET
  const got = (req.headers.authorization || req.headers.Authorization || '').replace(/^Bearer\s+/i, '')
  if (!expected || got !== expected) return res.status(401).json({ ok: false, error: 'No autorizado' })

  const supabaseUrl = env.VITE_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  const crmUser = env.CRM_SYNC_USER
  const crmPass = env.CRM_SYNC_PASS
  if (!supabaseUrl || !serviceRoleKey || !crmUser || !crmPass) {
    return res.status(501).json({ ok: false, error: 'Faltan env vars (SUPABASE / CRM_SYNC_*) para el sync.' })
  }

  try {
    const run = await runner({
      supabaseUrl,
      serviceRoleKey,
      crmUser,
      crmPass,
      r2: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        endpoint: env.R2_ENDPOINT,
        bucket: env.R2_BUCKET_NAME,
        publicUrlBase: env.R2_PUBLIC_URL,
      },
      disparadoPor: 'cron',
    })
    return res.status(200).json({ ok: true, run })
  } catch (e) {
    console.error('[sync-legacy]', e.message)
    return res.status(500).json({ ok: false, error: e.message })
  }
}

export default function handler(req, res) {
  return handleSyncLegacy(req, res)
}
