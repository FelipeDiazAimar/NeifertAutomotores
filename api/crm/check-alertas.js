import { createClient } from '@supabase/supabase-js'
import { enviarPush as enviarPushReal } from '../../src/server/webPush.js'
import { enviarEmail as enviarEmailReal } from '../../src/server/resendEmail.js'

const MARGEN_MS = 45 * 60 * 1000 // tolerancia: cron cada 15-30 min + margen

// fecha/hora se cargan en hora de Argentina (UTC-3, sin horario de verano).
// Sin fijar el offset acá, un server en UTC (Vercel) interpretaría "10:05"
// como las 10:05 UTC — 3hs adelantado respecto a la hora real cargada.
function tocaAvisar(fecha, hora, ahora) {
  const objetivo = new Date(`${fecha}T${hora}:00-03:00`)
  return ahora >= objetivo && ahora - objetivo <= MARGEN_MS
}

/** Serverless — revisa las alertas pendientes y dispara push+email a la
 *  fecha+hora que eligió el empleado. Cada canal se marca por separado
 *  (`notificado_push` / `notificado_email`): si un canal no tiene a dónde
 *  enviar (sin suscripción push o sin email) se marca igual para no
 *  reintentarlo; si el envío falla, queda pendiente y se reintenta en la
 *  próxima corrida. Se dispara desde un cron externo (cron-job.org) cada
 *  15-30 min — el cron nativo de Vercel (Hobby) solo corre 1 vez/día,
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
      .or('notificado_push.eq.false,notificado_email.eq.false')
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
  let enviadas = 0
  const errores = []

  for (const a of alertas) {
    if (a.notificado_push && a.notificado_email) continue
    if (!tocaAvisar(a.fecha, a.hora, ahora)) continue

    let pushOk = Boolean(a.notificado_push)
    let emailOk = Boolean(a.notificado_email)

    if (!pushOk) {
      try {
        const subs = await cargarSuscripciones(a.asignado_a)
        if (subs.length) {
          const { vencidas } = await enviarPush({
            subscriptions: subs,
            payload: {
              title: `Alerta: ${a.titulo}`,
              body: a.descripcion || 'Es ahora.',
              url: '/crm/alertas',
            },
          })
          await borrarSuscripcionesVencidas(vencidas)
        }
        pushOk = true
      } catch (e) {
        errores.push(`alerta ${a.id} (web): ${e.message}`)
      }
    }

    if (!emailOk) {
      try {
        if (a.asignado?.email) {
          await enviarEmail({
            to: a.asignado.email,
            subject: `Alerta: ${a.titulo}`,
            html: `<p><strong>${a.titulo}</strong></p><p>${a.descripcion ?? ''}</p>`,
          })
        }
        emailOk = true
      } catch (e) {
        errores.push(`alerta ${a.id} (email): ${e.message}`)
      }
    }

    if (pushOk !== Boolean(a.notificado_push) || emailOk !== Boolean(a.notificado_email)) {
      await marcarNotificada(a.id, { notificado_push: pushOk, notificado_email: emailOk })
      enviadas++
    }
  }

  return res.status(200).json({ ok: errores.length === 0, enviadas, errores })
}

export default function handler(req, res) {
  return handleCheckAlertas(req, res)
}
