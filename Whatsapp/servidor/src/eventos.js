/*
 * Canal en vivo hacia los navegadores (Server-Sent Events) + registro de actividad.
 *
 * Todos los navegadores abiertos reciben lo mismo en el mismo momento: por eso varios
 * empleados pueden atender el mismo número sin pisarse. Además se lleva la cuenta de
 * quién está conectado y qué chat tiene abierto, para avisar "Nico está en este chat".
 */
import { usuarioActual } from './auth.js'

const clientes = new Map() // res → { usuario, pestana }
const registro = []

// Qué chat tiene abierto cada pestaña. Una persona puede tener el panel abierto en dos
// lugares a la vez: se cuenta por pestaña y se muestra por persona.
const viendo = new Map() // pestana → { id, nombre, chatId }

export function suscribir(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    // Algunos proxies (nginx, por ejemplo) juntan la respuesta y demoran los eventos.
    'X-Accel-Buffering': 'no',
  })
  res.write('retry: 2000\n\n')
  const pestana = String(req.query.pestana || '').slice(0, 40) || Math.random().toString(36).slice(2)
  clientes.set(res, { usuario: req.usuario || null, pestana })
  // Apenas conecta, recibe quién más está usando el panel.
  res.write(`event: agentes\ndata: ${JSON.stringify(agentes())}\n\n`)
  req.on('close', () => {
    clientes.delete(res)
    if (viendo.delete(pestana)) emitirAgentes()
  })
}

export function emitir(evento, datos) {
  const payload = `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`
  for (const res of clientes.keys()) res.write(payload)
}

/* ---------------- Quién está en qué chat ---------------- */

/** Personas con el panel abierto y el chat que están mirando (una fila por persona). */
export function agentes() {
  const porPersona = new Map()
  for (const { usuario } of clientes.values()) {
    if (usuario && !porPersona.has(usuario.id)) porPersona.set(usuario.id, { id: usuario.id, nombre: usuario.nombre, chats: [] })
  }
  for (const v of viendo.values()) {
    const p = porPersona.get(v.id)
    if (p && v.chatId && !p.chats.includes(v.chatId)) p.chats.push(v.chatId)
  }
  return [...porPersona.values()]
}

const emitirAgentes = () => emitir('agentes', agentes())

/** La pestaña `pestana` del usuario actual abrió `chatId` (o cerró el chat, con null). */
export function marcarViendo(pestana, chatId) {
  const u = usuarioActual()
  if (!u || !pestana) return agentes()
  const clave = String(pestana).slice(0, 40)
  const previo = viendo.get(clave)
  if (previo?.chatId === chatId) return agentes()
  if (chatId) viendo.set(clave, { id: u.id, nombre: u.nombre, chatId })
  else viendo.delete(clave)
  emitirAgentes()
  return agentes()
}

/* ---------------- Registro ---------------- */

/** nivel: 'ok' | 'info' | 'aviso' | 'error'. Si lo dispara un empleado, queda su nombre. */
export function log(nivel, texto, detalle = '') {
  const quien = usuarioActual()?.nombre || null
  const item = { ts: Date.now(), nivel, texto, detalle, quien }
  registro.unshift(item)
  if (registro.length > 300) registro.pop()
  const hora = new Date().toLocaleTimeString('es-AR')
  console.log(`[${hora}] ${texto}${detalle ? ` · ${detalle}` : ''}${quien ? ` (${quien})` : ''}`)
  emitir('log', item)
}

export const ultimosLogs = () => registro

// Mantiene viva la conexión SSE detrás de proxies que cortan conexiones inactivas.
setInterval(() => {
  for (const res of clientes.keys()) res.write(': ping\n\n')
}, 25000).unref()
