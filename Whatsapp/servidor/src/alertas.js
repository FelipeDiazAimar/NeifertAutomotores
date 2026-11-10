/**
 * Alertas del CRM por WhatsApp. Las alertas (crm.alertas) ya avisan por push y email
 * desde el cron de Vercel (api/crm/check-alertas.js); este módulo suma el WhatsApp: cada
 * minuto busca las que llegaron a su fecha+hora y le manda un mensaje, desde la línea de
 * la concesionaria, al teléfono del usuario asignado (crm.usuarios.telefono).
 *
 * Cada alerta se "toma" antes de mandarla (PATCH condicionado a notificado_whatsapp=false):
 * si dos servidores o dos vueltas la ven a la vez, solo uno la manda. Si el envío falla se
 * suelta y se reintenta en la próxima vuelta, mientras siga dentro del margen.
 */
import { normalizarAR } from './telefono.js'

// A tiempo: hasta 45 min tarde (como el cron del mail). Si la PC estuvo apagada, al volver
// se ponen al día las de hasta 24 h, avisando que llegan tarde; más viejas ya no sirven.
const MARGEN_MS = 45 * 60 * 1000
const ATRASO_MAX_MS = 24 * 3600e3
const CADA_MS = 60 * 1000

// fecha/hora se cargan en hora de Argentina (UTC-3, sin horario de verano).
const objetivoDe = (fecha, hora) => new Date(`${fecha}T${hora}:00-03:00`)

export function tocaAvisar(fecha, hora, ahora, margen = ATRASO_MAX_MS) {
  const objetivo = objetivoDe(fecha, hora)
  return ahora >= objetivo && ahora - objetivo <= margen
}

// Los empleados son de Argentina: "3564 15 562413" (12 dígitos, sin 0) normalizarAR lo toma
// por extranjero; con el 0 adelante sí lo reconoce.
export function telefonoEmpleado(telefono) {
  const d = String(telefono ?? '').replace(/\D/g, '')
  return normalizarAR(d.length === 12 && !d.startsWith('54') ? `0${d}` : d)
}

export function textoAlerta(a, ahora = new Date()) {
  const atrasada = ahora - objetivoDe(a.fecha, a.hora) > MARGEN_MS
  return [
    `🔔 *Alerta: ${a.titulo}*`,
    a.descripcion,
    `Para el ${a.fecha.split('-').reverse().join('/')} a las ${a.hora} hs.`,
    atrasada && '_Llega tarde: el WhatsApp de la concesionaria estuvo apagado._',
  ]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Una vuelta. deps: rest (API del CRM), abrirChat(telefono) → jid, enviarTexto(jid, texto),
 * conectado() y log. Devuelve cuántas alertas se mandaron.
 */
export async function revisarAlertas({ rest, abrirChat, enviarTexto, conectado, log, ahora = new Date() }) {
  if (!conectado()) return 0
  // 27 h antes en UTC = 24 h antes en hora argentina: lo justo para el atraso máximo.
  const ayer = new Date(ahora.getTime() - 27 * 3600e3).toISOString().slice(0, 10)
  const alertas = await rest(
    `alertas?select=id,titulo,descripcion,fecha,hora,asignado:usuarios!alertas_asignado_a_fkey(telefono)` +
      `&hecha=eq.false&notificado_whatsapp=eq.false&fecha=gte.${ayer}`
  )
  let enviadas = 0
  for (const a of alertas) {
    if (!tocaAvisar(a.fecha, a.hora, ahora)) continue
    const tomada = await rest(`alertas?id=eq.${a.id}&notificado_whatsapp=eq.false`, {
      metodo: 'PATCH',
      cuerpo: { notificado_whatsapp: true },
    })
    if (!tomada?.length) continue // la tomó otro
    const telefono = telefonoEmpleado(a.asignado?.telefono)
    if (!telefono) continue // sin teléfono cargado: queda marcada, no hay a dónde mandar
    try {
      await enviarTexto(await abrirChat(telefono), textoAlerta(a, ahora))
      enviadas++
    } catch (err) {
      log('aviso', `No se pudo mandar por WhatsApp la alerta ${a.id}`, err.message)
      await rest(`alertas?id=eq.${a.id}`, { metodo: 'PATCH', cuerpo: { notificado_whatsapp: false } }).catch(() => {})
    }
  }
  return enviadas
}

let vigilando = false
let revisando = false
let ultimoError = ''
/** Arranca la revisión cada minuto (una sola vez). */
export function vigilarAlertas(deps) {
  if (vigilando) return
  vigilando = true
  setInterval(async () => {
    if (revisando) return
    revisando = true
    try {
      const n = await revisarAlertas(deps)
      if (n) deps.log('ok', 'Alertas del CRM por WhatsApp', `${n} enviada${n === 1 ? '' : 's'}`)
      ultimoError = ''
    } catch (err) {
      // Una vez por error distinto, no cada minuto (p. ej. falta la columna en la base).
      if (err.message !== ultimoError) deps.log('aviso', 'No se pudieron revisar las alertas del CRM', err.message)
      ultimoError = err.message
    } finally {
      revisando = false
    }
  }, CADA_MS).unref()
}
