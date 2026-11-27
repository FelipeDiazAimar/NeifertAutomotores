/**
 * Charlas de Sofía (el asistente con IA del programa BOT WhatsApp, que atiende con su
 * propia línea fuera de horario). El bot las manda por /api/bot/mensajes y quedan en el
 * chat del mismo cliente, mezcladas por hora con los de esta línea, para que los
 * empleados vean qué se habló.
 *
 * Se guardan como mensajes con `sofia: { rol, asistente, derivo? }` e id "sofia:<id>".
 * No son de esta línea: listarMensajes los deja afuera (leídos, archivados, recibos,
 * respaldo de la línea) y no se les puede contestar, reaccionar ni borrar.
 */
import { agregarMensaje, buscarChat, upsertChat } from './almacen.js'
import { normalizarAR } from './telefono.js'

const MAX_MENSAJES = 50
const MAX_TEXTO = 4000

const error = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status })

export const esDeSofia = (id) => typeof id === 'string' && id.startsWith('sofia:')

/** Guarda lo que mandó el bot. Repetir un id no duplica. */
export function guardarCharla({ telefono, nombre, asistente, mensajes } = {}) {
  const numero = normalizarAR(telefono)
  if (!numero) throw error('Teléfono inválido.')
  if (!Array.isArray(mensajes) || !mensajes.length) throw error('No llegó ningún mensaje.')
  if (mensajes.length > MAX_MENSAJES) throw error(`Máximo ${MAX_MENSAJES} mensajes por pedido.`)
  const quien = String(asistente || '').trim().slice(0, 60) || 'Asistente'
  const jid = `${numero}@s.whatsapp.net`

  const limpios = mensajes.map((m) => {
    const id = String(m?.id || '').trim().slice(0, 120)
    const ts = Number(m?.ts)
    const texto = String(m?.texto ?? '').slice(0, MAX_TEXTO)
    if (!id || !Number.isFinite(ts) || ts <= 0 || !['cliente', 'bot'].includes(m?.rol) || !texto.trim()) {
      throw error('Cada mensaje necesita id, ts, rol (cliente o bot) y texto.')
    }
    const sofia = { rol: m.rol, asistente: quien, ...(m.rol === 'bot' && m.derivo ? { derivo: true } : {}) }
    return { id: `sofia:${id}`, ts: Math.floor(ts / 1000), deMi: m.rol === 'bot', tipo: 'texto', texto, sofia }
  })

  const previo = buscarChat(jid)
  if (!previo?.pushName && String(nombre || '').trim()) upsertChat(jid, { pushName: String(nombre).trim().slice(0, 80) })

  let nuevos = 0
  let ultimaRespuesta = null
  for (const m of limpios.sort((a, b) => a.ts - b.ts)) {
    if (!agregarMensaje(jid, m).nuevo) continue
    nuevos++
    if (m.sofia.rol === 'bot') ultimaRespuesta = m
  }
  if (nuevos) {
    const chat = buscarChat(jid)
    const tope = Math.max(chat.sofiaTs || 0, ...limpios.map((m) => m.ts))
    upsertChat(jid, {
      sofiaTs: tope,
      sofiaNoVistos: (chat.sofiaNoVistos || 0) + nuevos,
      sofiaAsistente: quien,
      ...(ultimaRespuesta && ultimaRespuesta.ts >= (chat.sofiaUltimo?.ts || 0) ? { sofiaUltimo: { texto: ultimaRespuesta.texto.slice(0, 200), ts: ultimaRespuesta.ts } } : {}),
    })
  }
  return { ok: true, chatId: jid, nuevos }
}

/** Alguien abrió el chat en el panel: lo de Sofía ya está visto. */
export function sofiaVisto(jid) {
  if (buscarChat(jid)?.sofiaNoVistos) upsertChat(jid, { sofiaNoVistos: 0 })
}
