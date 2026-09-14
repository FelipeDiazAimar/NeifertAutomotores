/*
 * Fotos de perfil. Se consultan de a una en segundo plano (WhatsApp limita las
 * consultas seguidas) y se guardan en data/fotos/. Cada foto se vuelve a
 * consultar después de 7 días; si el contacto no tiene o no la comparte, se
 * recuerda para no preguntar en cada inicio.
 */
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from './config.js'
import { clave, infoFoto, listarChats, setFoto } from './almacen.js'

export const FOTOS_DIR = path.join(DATA_DIR, 'fotos')
fs.mkdirSync(FOTOS_DIR, { recursive: true })

const VIGENCIA_MS = 7 * 24 * 3600 * 1000
const PAUSA_MS = 1500

const cola = []
const enCola = new Set()
let trabajando = false
let obtenerSock = () => null

export const rutaFoto = (jid) => path.join(FOTOS_DIR, `${clave(jid)}.jpg`)

/** Recibe una función que devuelve el socket conectado (o null si no hay conexión). */
export function configurarFotos(getSock) {
  obtenerSock = getSock
}

/** Encola chats. Con urgente pasan adelante (por ejemplo, el chat que se acaba de abrir). */
export function pedirFotos(jids, { urgente = false } = {}) {
  for (const jid of jids) {
    const info = infoFoto(jid)
    if (info && Date.now() - info.ts < VIGENCIA_MS) continue
    if (enCola.has(jid)) {
      if (urgente) {
        cola.splice(cola.indexOf(jid), 1)
        cola.unshift(jid)
      }
      continue
    }
    enCola.add(jid)
    if (urgente) cola.unshift(jid)
    else cola.push(jid)
  }
  procesar()
}

export function pedirFotosDeTodos() {
  pedirFotos(listarChats().map((c) => c.id))
}

async function procesar() {
  if (trabajando) return
  trabajando = true
  try {
    while (cola.length) {
      const sock = obtenerSock()
      if (!sock) break // sin conexión: la cola sigue esperando
      const jid = cola.shift()
      enCola.delete(jid)
      await bajarFoto(sock, jid)
      await new Promise((r) => setTimeout(r, PAUSA_MS))
    }
  } finally {
    trabajando = false
  }
}

async function bajarFoto(sock, jid) {
  let url
  try {
    url = await sock.profilePictureUrl(jid, 'preview', 15000)
  } catch (err) {
    // Cortes de conexión o demoras: se reintenta en otra vuelta. Cualquier otro error
    // (sin foto, privacidad) se recuerda para no volver a preguntar enseguida.
    if (!/timed out|connection|closed/i.test(err?.message || '')) setFoto(jid, false)
    return
  }
  if (!url) {
    setFoto(jid, false)
    return
  }
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    fs.writeFileSync(rutaFoto(jid), Buffer.from(await res.arrayBuffer()))
    setFoto(jid, true)
  } catch {
    // El enlace de la foto venció en el camino: se reintenta en otra vuelta.
  }
}
