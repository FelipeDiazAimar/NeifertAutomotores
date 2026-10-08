/*
 * Canal en vivo hacia los navegadores (Server-Sent Events) + registro de actividad.
 *
 * Todos los navegadores abiertos reciben lo mismo en el mismo momento: por eso varios
 * empleados pueden atender el mismo número sin pisarse. Además se lleva la cuenta de
 * quién está conectado y qué chat tiene abierto, para avisar "Nico está en este chat".
 *
 * El registro de actividad va también a archivos, uno por día (data/logs/AAAA-MM-DD.log),
 * y se conservan LOG_DIAS días: sobrevive a un reinicio y se puede revisar después.
 */
import fs from 'node:fs'
import path from 'node:path'
import { manejaLinea, usuarioActual } from './auth.js'
import { LOG_DIAS, LOG_DIR } from './config.js'

const clientes = new Map() // res → { usuario, pestana }
const registro = []
const MAX_EN_MEMORIA = 300

// Qué chat tiene abierto cada pestaña. Una persona puede tener el panel abierto en dos
// lugares a la vez: se cuenta por pestaña y se muestra por persona.
const viendo = new Map() // pestana → { id, nombre, chatId, ts }

// Un chat lo atiende una sola persona a la vez. La pestaña avisa cada minuto que sigue en
// el chat mientras alguien la usa; si deja de avisar (se fue y lo dejó abierto), el chat
// se libera solo pasado este tiempo.
const VENCE_MS = 3 * 60_000

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

/**
 * `datos` puede ser una función (usuario) → datos, para lo que no todos pueden ver (el QR).
 * Si devuelve undefined, a ese usuario no se le manda nada.
 */
export function emitir(evento, datos) {
  const armar = (d) => `event: ${evento}\ndata: ${JSON.stringify(d)}\n\n`
  if (typeof datos === 'function') {
    for (const [res, { usuario }] of clientes) {
      const d = datos(usuario)
      if (d !== undefined) res.write(armar(d))
    }
    return
  }
  const payload = armar(datos)
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

/** Quién (que no sea `usuarioId`) está atendiendo `chatId`, o null si está libre. */
export function ocupanteDe(chatId, usuarioId) {
  if (!chatId) return null
  for (const v of viendo.values()) {
    if (v.chatId === chatId && v.id !== usuarioId) return { id: v.id, nombre: v.nombre }
  }
  return null
}

/**
 * La pestaña `pestana` del usuario actual abrió `chatId` (o cerró el chat, con null).
 * Si otra persona lo está atendiendo, no entra (error 409 con quién lo tiene), salvo que
 * un administrador lo tome (`forzar`): ahí a la otra persona se le cierra el chat.
 * Llamarlo de nuevo con el mismo chat renueva el aviso de que sigue ahí.
 */
export function marcarViendo(pestana, chatId, { forzar = false } = {}) {
  const u = usuarioActual()
  if (!u || !pestana) return agentes()
  const clave = String(pestana).slice(0, 40)
  const previo = viendo.get(clave)
  if (chatId) {
    const ocupante = ocupanteDe(chatId, u.id)
    if (ocupante && !(forzar && manejaLinea(u))) {
      throw Object.assign(new Error(`${ocupante.nombre} está atendiendo este chat.`), { status: 409, datos: { ocupado: ocupante } })
    }
    if (ocupante) {
      for (const [k, v] of viendo) if (v.chatId === chatId && v.id !== u.id) viendo.delete(k)
      log('info', 'Chat tomado', `${u.nombre} se lo tomó a ${ocupante.nombre}`)
    }
  }
  if (previo?.chatId === chatId && chatId) {
    previo.ts = Date.now()
    if (!forzar) return agentes()
  }
  if (chatId) viendo.set(clave, { id: u.id, nombre: u.nombre, chatId, ts: Date.now() })
  else viendo.delete(clave)
  emitirAgentes()
  return agentes()
}

// Chats que nadie toca hace rato: se liberan para que otro pueda entrar.
setInterval(() => {
  let vencidos = 0
  for (const [k, v] of viendo) {
    if (Date.now() - v.ts > VENCE_MS) {
      viendo.delete(k)
      vencidos++
    }
  }
  if (vencidos) emitirAgentes()
}, 30_000).unref()

/* ---------------- Registro ---------------- */

const dos = (n) => String(n).padStart(2, '0')
const diaDe = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
const horaDe = (d) => `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`
const archivoDelDia = (d) => path.join(LOG_DIR, `${diaDe(d)}.log`)

const oyentes = new Set()
/** Avisa cada entrada del registro (lo usa el vigía para disparar alertas). */
export const alRegistrar = (fn) => oyentes.add(fn)

let diaActual = null
/** Borra los archivos de registro más viejos que LOG_DIAS. Corre al arrancar y al cambiar el día. */
function rotar(hoy) {
  diaActual = diaDe(hoy)
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    const limite = Date.now() - LOG_DIAS * 86400e3
    for (const f of fs.readdirSync(LOG_DIR)) {
      const m = /^(\d{4})-(\d{2})-(\d{2})\.log$/.exec(f)
      if (m && new Date(+m[1], +m[2] - 1, +m[3]).getTime() < limite) fs.rmSync(path.join(LOG_DIR, f))
    }
  } catch (err) {
    console.error(`No se pudieron rotar los registros: ${err.message}`)
  }
}

/** nivel: 'ok' | 'info' | 'aviso' | 'error'. Si lo dispara un empleado, queda su nombre. */
export function log(nivel, texto, detalle = '') {
  const quien = usuarioActual()?.nombre || null
  const ahora = new Date()
  const item = { ts: ahora.getTime(), nivel, texto, detalle, quien }
  registro.unshift(item)
  if (registro.length > MAX_EN_MEMORIA) registro.pop()
  const linea = `[${horaDe(ahora)}] ${texto}${detalle ? ` · ${detalle}` : ''}${quien ? ` (${quien})` : ''}`
  console.log(linea)
  if (diaActual !== diaDe(ahora)) rotar(ahora)
  try {
    fs.appendFileSync(archivoDelDia(ahora), `${JSON.stringify(item)}\n`)
  } catch (err) {
    console.error(`No se pudo escribir el registro: ${err.message}`)
  }
  // La actividad del servidor la ven solo los administradores (los que manejan la línea).
  emitir('log', (usuario) => (manejaLinea(usuario) ? item : undefined))
  for (const fn of oyentes) {
    try {
      fn(item)
    } catch {}
  }
}

export const ultimosLogs = () => registro

// Al arrancar, la actividad reciente sale de los archivos: así no se pierde al reiniciar.
try {
  const hoy = new Date()
  const ayer = new Date(hoy.getTime() - 86400e3)
  for (const d of [ayer, hoy]) {
    const f = archivoDelDia(d)
    if (!fs.existsSync(f)) continue
    for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!l) continue
      try {
        registro.unshift(JSON.parse(l))
      } catch {}
    }
  }
  registro.splice(MAX_EN_MEMORIA)
} catch {}

// Mantiene viva la conexión SSE detrás de proxies que cortan conexiones inactivas.
setInterval(() => {
  for (const res of clientes.keys()) res.write(': ping\n\n')
}, 25000).unref()
