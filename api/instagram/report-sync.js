import { mergeAndSaveInstagramItems } from '../../src/server/instagramCore.js'

const { VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INSTAGRAM_AGENT_TOKEN, R2_PUBLIC_URL } = process.env

function validItem(it) {
  if (!it || typeof it.id !== 'string' || !/^ig-\d+$/.test(it.id)) return false
  if (it.type !== 'image' && it.type !== 'video') return false
  if (typeof it.url !== 'string') return false
  if (R2_PUBLIC_URL && !it.url.startsWith(R2_PUBLIC_URL.replace(/\/$/, ''))) return false
  return true
}

/** Recibe lo que encontró el agente/ejecutable de Instagram corriendo en la
 *  compu de un empleado (ya subido a R2 vía /api/r2/presign) y lo guarda.
 *  Esta es la ÚNICA pieza con las claves reales de Supabase — el agente
 *  nunca las tiene.
 *
 * POST /api/instagram/report-sync
 *   headers: { 'x-agent-token': <INSTAGRAM_AGENT_TOKEN> }
 *   body: { items: [{ id, type, url, caption, link }] }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  if (INSTAGRAM_AGENT_TOKEN && req.headers['x-agent-token'] !== INSTAGRAM_AGENT_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Token inválido.' })
  }

  try {
    const items = Array.isArray(req.body?.items) ? req.body.items.filter(validItem) : []
    const result = await mergeAndSaveInstagramItems({
      supabaseUrl: VITE_SUPABASE_URL,
      supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      newItems: items,
    })
    res.status(200).json({ ok: true, ...result })
  } catch (e) {
    console.error('[instagram] report-sync:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
}
