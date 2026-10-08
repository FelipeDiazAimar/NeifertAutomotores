/*
 * Fotos de perfil. Se consultan de a una en segundo plano (WhatsApp limita las
 * consultas seguidas) y se guardan como fotos/<chat>.jpg (en R2 o en el disco, ver
 * archivos.js). Cada foto se vuelve a consultar después de 7 días; si el contacto no
 * tiene o no la comparte, se recuerda para no preguntar en cada inicio.
 */
import { clave, conFotoGuardada, infoFoto, listarChats, setFoto } from './almacen.js'
import { guardar, listarArchivos } from './archivos.js'
import { sinUsuario } from './auth.js'

const VIGENCIA_MS = 7 * 24 * 3600 * 1000
const PAUSA_MS = 1500

const cola = []
const enCola = new Set()
let trabajando = false
let obtenerSock = () => null

export const claveFoto = (jid) => `fotos/${clave(jid)}.jpg`

/** Recibe una función que devuelve el socket conectado (o null si no hay conexión). */
export function configurarFotos(getSock) {
  obtenerSock = getSock
}

/**
 * Encola chats. Con urgente pasan adelante (por ejemplo, el chat que se acaba de abrir).
 * Con forzar se consulta aunque la foto se haya traído hace menos de VIGENCIA_MS.
 */
export function pedirFotos(jids, { urgente = false, forzar = false } = {}) {
  for (const jid of jids) {
    const info = infoFoto(jid)
    if (!forzar && info && Date.now() - info.ts < VIGENCIA_MS) continue
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
  // La cola sigue trabajando después del pedido que la despertó: va sin usuario.
  sinUsuario(() => procesar())
}

const recuperadas = new Set()

/**
 * La foto figura como guardada pero el archivo no está (se borró del disco, o la registró
 * otro servidor que usa la misma base): se vuelve a bajar. Una vez por chat y por arranque,
 * así un contacto que ya no tiene foto no se consulta en cada pedido.
 */
export function recuperarFoto(jid) {
  if (!infoFoto(jid)?.tiene || recuperadas.has(jid)) return
  recuperadas.add(jid)
  pedirFotos([jid], { urgente: true, forzar: true })
}

/**
 * Compara las fotos que figuran como guardadas con las que de verdad están (en R2 o en el
 * disco) y vuelve a bajar las que faltan. Se corre al conectar.
 */
export async function repararFotos() {
  const hay = new Set((await listarArchivos('fotos/')).map((a) => a.clave))
  const faltan = conFotoGuardada().filter((jid) => !hay.has(claveFoto(jid)))
  if (!faltan.length) return 0
  for (const jid of faltan) recuperadas.add(jid)
  pedirFotos(faltan, { forzar: true })
  return faltan.length
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
    await guardar(claveFoto(jid), Buffer.from(await res.arrayBuffer()), 'image/jpeg')
    setFoto(jid, true)
  } catch {
    // El enlace de la foto venció en el camino (o R2 no respondió): se reintenta en otra vuelta.
  }
}
