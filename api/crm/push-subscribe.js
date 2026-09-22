import { createClient } from '@supabase/supabase-js'

/** Serverless — guarda la suscripción de Web Push del usuario logueado.
 *
 *  POST /api/crm/push-subscribe
 *  Authorization: Bearer <access token del usuario logueado>
 *  body: { endpoint, p256dh, auth }
 */
export async function handlePushSubscribe(req, res, { env = process.env, deps = {} } = {}) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const url = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) return res.status(501).json({ ok: false, error: 'Faltan credenciales de Supabase en el servidor' })

  const token = (req.headers.authorization || req.headers.Authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de sesión' })

  const makeAnon = deps.makeAnon || (() => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } }))
  const makeAdmin = deps.makeAdmin || (() => createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }))

  const anon = makeAnon()
  const { data: authData, error: authErr } = await anon.auth.getUser(token)
  const uid = authData?.user?.id
  if (authErr || !uid) return res.status(401).json({ ok: false, error: 'Sesión inválida' })

  const { endpoint, p256dh, auth } = req.body || {}
  if (!endpoint || !p256dh || !auth) return res.status(400).json({ ok: false, error: 'Faltan datos de la suscripción.' })

  const admin = makeAdmin()
  const { error } = await admin.schema('crm').from('push_subscriptions')
    .upsert({ usuario_id: uid, endpoint, p256dh, auth }, { onConflict: 'endpoint' })
  if (error) return res.status(500).json({ ok: false, error: error.message })

  return res.status(200).json({ ok: true })
}

export default function handler(req, res) {
  return handlePushSubscribe(req, res)
}
