import { createClient } from '@supabase/supabase-js'
import { enviarPush as enviarPushReal } from '../../src/server/webPush.js'
import { enviarEmail as enviarEmailReal } from '../../src/server/resendEmail.js'

const MARGEN_MS = 45 * 60 * 1000 // tolerancia: cron cada 15-30 min + margen

// fecha/hora se cargan en hora de Argentina (UTC-3, sin horario de verano).
// Sin fijar el offset acá, un server en UTC (Vercel) interpretaría "10:05"
// como las 10:05 UTC — 3hs adelantado respecto a la hora real cargada.
function yaPaso(fecha, hora, horasAntes, ahora) {
  const objetivo = new Date(`${fecha}T${hora}:00-03:00`)
  objetivo.setTime(objetivo.getTime() - horasAntes * 60 * 60 * 1000)
  return ahora >= objetivo && ahora - objetivo <= MARGEN_MS
}

/** Serverless — revisa las alertas pendientes y dispara push+email 24hs y 3hs
 *  antes de su fecha+hora. Se dispara desde un cron externo (cron-job.org)
 *  cada 15-30 min — el cron nativo de Vercel (Hobby) solo corre 1 vez/día,
 *  no sirve para esta precisión.
 *
 *  GET|POST /api/crm/check-alertas
 *  Authorization: Bearer <CRON_SECRET>
 */
export async function handleCheckAlertas(req, res, { env = process.env, deps = {} } = {}) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const secret = env.CRON_SECRET
  const got = (req.headers.authorization || req.headers.Authorization || '').replace(/^Bearer\s+/i, '')
  if (!secret || got !== secret) return res.status(401).json({ ok: false, error: 'No autorizado' })

  const url = env.VITE_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  // Lazy: si deps ya trae las funciones de datos mockeadas (tests), nunca
  // hace falta un cliente real — no vale la pena validar env vars ahí.
  let _admin = null
  const admin = () => {
    if (!_admin) _admin = deps.makeAdmin ? deps.makeAdmin() : createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    return _admin
  }
  const db = () => admin().schema('crm')

  const ahora = (deps.now || (() => new Date()))()

  const cargarAlertasPendientes = deps.cargarAlertasPendientes || (async () => {
    const { data, error } = await db().from('alertas')
      .select('*, asignado:usuarios!alertas_asignado_a_fkey(email)')
      .eq('hecha', false)
      .or('notificado_24h.eq.false,notificado_3h.eq.false')
    if (error) throw error
    return data ?? []
  })
  const cargarSuscripciones = deps.cargarSuscripciones || (async (usuarioId) => {
    const { data, error } = await db().from('push_subscriptions').select('*').eq('usuario_id', usuarioId)
    if (error) throw error
    return data ?? []
  })
  const marcarNotificada = deps.marcarNotificada || (async (id, patch) => {
    const { error } = await db().from('alertas').update(patch).eq('id', id)
    if (error) throw error
  })
  const borrarSuscripcionesVencidas = deps.borrarSuscripcionesVencidas || (async (endpoints) => {
    if (!endpoints.length) return
    await db().from('push_subscriptions').delete().in('endpoint', endpoints)
  })
  const enviarPush = deps.enviarPush || enviarPushReal
  const enviarEmail = deps.enviarEmail || enviarEmailReal

  const alertas = await cargarAlertasPendientes()
  let enviadas24h = 0
  let enviadas3h = 0
  const errores = []

  for (const a of alertas) {
    for (const [campo, horasAntes, contador] of [
      ['notificado_24h', 24, () => enviadas24h++],
      ['notificado_3h', 3, () => enviadas3h++],
    ]) {
      if (a[campo]) continue
      if (!yaPaso(a.fecha, a.hora, horasAntes, ahora)) continue
      try {
        const subs = await cargarSuscripciones(a.asignado_a)
        const payload = {
          title: `Alerta: ${a.titulo}`,
          body: horasAntes === 24 ? 'Vence mañana a esta hora.' : 'Vence en 3 horas.',
          url: '/crm/alertas',
        }
        if (subs.length) {
          const { vencidas } = await enviarPush({ subscriptions: subs, payload })
          await borrarSuscripcionesVencidas(vencidas)
        }
        if (a.asignado?.email) {
          await enviarEmail({
            to: a.asignado.email,
            subject: payload.title,
            html: `<p>${payload.body}</p><p><strong>${a.titulo}</strong></p><p>${a.descripcion ?? ''}</p>`,
          })
        }
        await marcarNotificada(a.id, { [campo]: true })
        contador()
      } catch (e) {
        errores.push(`alerta ${a.id} (${campo}): ${e.message}`)
      }
    }
  }

  return res.status(200).json({ ok: errores.length === 0, enviadas24h, enviadas3h, errores })
}

export default function handler(req, res) {
  return handleCheckAlertas(req, res)
}
