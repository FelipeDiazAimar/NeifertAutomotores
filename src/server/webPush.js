import webpush from 'web-push'

/** Manda un push a cada suscripción. Devuelve los endpoints que dieron 404/410
 *  (suscripción vencida — el caller las borra de crm.push_subscriptions). */
export async function enviarPush({ subscriptions, payload }, deps = {}) {
  const wp = deps.webpush || webpush
  const vapid = deps.vapid || {
    subject: process.env.VAPID_SUBJECT,
    publicKey: process.env.VITE_VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  }
  wp.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)

  const vencidas = []
  for (const sub of subscriptions) {
    try {
      await wp.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      )
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) vencidas.push(sub.endpoint)
      else console.error('[webPush] error enviando a', sub.endpoint, e.message)
    }
  }
  return { vencidas }
}
