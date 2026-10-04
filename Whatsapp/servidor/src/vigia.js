/*
 * Vigía: avisa cuando algo necesita que una persona intervenga, en vez de esperar a que
 * un cliente diga "che, no me contestan".
 *
 *   - La línea lleva más de ALERTA_MINUTOS sin conectar (y cuando vuelve).
 *   - Se desvinculó, otra PC abrió la misma sesión (440) o WhatsApp la rechazó (403).
 *   - El celular lleva ALERTA_CELULAR_DIAS sin dar señales (WhatsApp desvincula a los 14).
 *   - El celular no responde los pedidos de reenvío de archivos (¿sin internet?).
 *   - La PC estuvo suspendida (el reloj saltó): se fuerza la reconexión.
 *
 * Los avisos van al registro (siempre) y, si están configurados, por email (Resend) y a
 * un webhook. Cada aviso tiene una clave: no se repite mientras el problema siga, salvo
 * que pasen REPETIR_MS.
 */
import { ALERTA_CELULAR_DIAS, ALERTA_EMAILS, ALERTA_MINUTOS, ALERTA_REMITENTE, ALERTA_WEBHOOK, RESEND_API_KEY } from './config.js'
import { log } from './eventos.js'

const REPETIR_MS = 6 * 3600 * 1000
const avisadas = new Map() // clave → ts del último aviso

const hayDestino = () => Boolean((RESEND_API_KEY && ALERTA_EMAILS.length) || ALERTA_WEBHOOK)

async function porEmail(titulo, detalle) {
  if (!RESEND_API_KEY || !ALERTA_EMAILS.length) return
  const html = `<p><b>${titulo}</b></p><p>${detalle.replace(/\n/g, '<br>')}</p><p style="color:#888">Servidor de WhatsApp de Neifert · ${new Date().toLocaleString('es-AR', { hour12: false })}</p>`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: ALERTA_REMITENTE, to: ALERTA_EMAILS, subject: `WhatsApp Neifert: ${titulo}`, html }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Resend respondió ${res.status}`)
}

async function porWebhook(titulo, detalle) {
  if (!ALERTA_WEBHOOK) return
  const res = await fetch(ALERTA_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titulo, detalle, origen: 'whatsapp-neifert', ts: new Date().toISOString() }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`El webhook respondió ${res.status}`)
}

/**
 * Manda un aviso. Con `clave`, no se repite hasta que se llame a resolver(clave) o pasen
 * REPETIR_MS. Devuelve true si se mandó.
 */
export function alertar(titulo, detalle = '', { clave = titulo, nivel = 'error' } = {}) {
  const previo = avisadas.get(clave)
  if (previo && Date.now() - previo < REPETIR_MS) return false
  avisadas.set(clave, Date.now())
  log(nivel, `ALERTA: ${titulo}`, detalle)
  for (const canal of [porEmail, porWebhook]) {
    canal(titulo, detalle).catch((err) => log('aviso', 'No se pudo mandar una alerta', `${canal.name}: ${err.message}`))
  }
  return true
}

/** El problema se resolvió: la próxima vez que pase se vuelve a avisar. */
export function resolver(clave, { aviso } = {}) {
  if (!avisadas.has(clave)) return
  avisadas.delete(clave)
  if (aviso) alertar(aviso, '', { clave: `${clave}:resuelto`, nivel: 'ok' }) && avisadas.delete(`${clave}:resuelto`)
}

/**
 * Arranca la vigilancia. `estado()` devuelve { conexion, desde } de la línea;
 * `ultimaSenalCelular()` el ts (ms) de la última señal del celular; `alDespertar()` se
 * llama cuando la PC vuelve de una suspensión.
 */
export function vigilar({ estado, ultimaSenalCelular, alDespertar }) {
  if (!hayDestino()) {
    log('aviso', 'Alertas sin destino', 'Definí WA_ALERTA_EMAIL (con RESEND_API_KEY) o WA_ALERTA_WEBHOOK para enterarte si la línea se cae')
  }
  let ultimoTic = Date.now()
  setInterval(() => {
    const ahora = Date.now()
    // El intervalo es de 30 s: si pasó mucho más, la PC estuvo suspendida o colgada.
    if (ahora - ultimoTic > 90_000) {
      log('aviso', 'La PC estuvo suspendida o sin responder', `${Math.round((ahora - ultimoTic) / 1000)} s · se reconecta WhatsApp`)
      alDespertar()
    }
    ultimoTic = ahora

    const { conexion, desde } = estado()
    const minutos = (ahora - desde) / 60000
    if (conexion === 'conectado') {
      resolver('caida', { aviso: 'La línea volvió a conectarse' })
    } else if (minutos >= ALERTA_MINUTOS) {
      const que = conexion === 'qr' ? 'está sin vincular (esperando el QR)' : `está ${conexion}`
      alertar('La línea de WhatsApp no está conectada', `Hace ${Math.round(minutos)} minutos que ${que}. Revisá la PC del servidor y el celular de la concesionaria.`, { clave: 'caida' })
    }

    const senal = ultimaSenalCelular()
    if (senal && conexion === 'conectado') {
      const dias = (ahora - senal) / 86400e3
      if (dias >= ALERTA_CELULAR_DIAS) {
        alertar(
          'El celular de la concesionaria no da señales',
          `Hace ${Math.floor(dias)} días que no hay actividad del celular. WhatsApp desvincula los dispositivos a los 14 días: abrí WhatsApp en el celular y dejalo con internet un rato.`,
          { clave: 'celular' },
        )
      } else {
        resolver('celular')
      }
    }
  }, 30_000).unref()
}
