/*
 * Almacenamiento local en archivos. Estructura dentro de data/:
 *
 *   sesion/                 credenciales de Baileys
 *   estado.json             chats, contactos, mapa LID → teléfono y preferencias
 *   mensajes/<chat>.jsonl   una operación por línea: {"op":"add","m":{…}} o {"op":"upd","id":"…","p":{…}}
 *   media/<chat>/<id>.<ext> fotos, videos, audios y documentos
 *
 * Los mensajes solo se agregan al final del archivo (nunca se reescribe), así un
 * corte de luz no puede dejar el historial corrupto y nada se borra: un mensaje
 * eliminado en WhatsApp es solo una línea "upd" más.
 *
 * Todo el acceso a disco pasa por este módulo: para migrar a una base de datos y
 * a Cloudflare R2 alcanza con reescribir este archivo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from './config.js'
import { emitir } from './eventos.js'

export const AUTH_DIR = path.join(DATA_DIR, 'sesion')
const MSG_DIR = path.join(DATA_DIR, 'mensajes')
const MEDIA_DIR = path.join(DATA_DIR, 'media')
const ESTADO_FILE = path.join(DATA_DIR, 'estado.json')

for (const dir of [DATA_DIR, MSG_DIR, MEDIA_DIR]) fs.mkdirSync(dir, { recursive: true })

const CONFIG_INICIAL = { descargarMedia: true, confirmarLectura: false }

const estado = leerJson(ESTADO_FILE, {})
estado.chats ??= {}
estado.contactos ??= {}
estado.lids ??= {}
estado.archivados ??= {}
estado.fijados ??= {}
estado.meta ??= {}
estado.fotos ??= {}
estado.silenciados ??= {}
estado.config = { ...CONFIG_INICIAL, ...estado.config }

function leerJson(file, porDefecto) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return porDefecto
  }
}

let guardarTimer
function guardarEstado() {
  clearTimeout(guardarTimer)
  guardarTimer = setTimeout(() => {
    const tmp = `${ESTADO_FILE}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(estado, null, 1))
    fs.renameSync(tmp, ESTADO_FILE)
  }, 400)
}

/** Nombre de archivo seguro para un JID: "5493564562413@s.whatsapp.net" → "5493564562413_s_whatsapp_net". */
export const clave = (jid) => jid.replace(/[^0-9a-z]+/gi, '_')

/* ---------------- Preferencias ---------------- */

export const config = () => estado.config
export function setConfig(patch) {
  for (const k of Object.keys(CONFIG_INICIAL)) {
    if (typeof patch[k] === 'boolean') estado.config[k] = patch[k]
  }
  guardarEstado()
  return estado.config
}

/* ---------------- Contactos y LID ---------------- */

export function setContacto(jid, { nombre, notify } = {}) {
  if (!jid) return
  const previo = estado.contactos[jid] || {}
  const nuevo = { ...previo }
  if (nombre) nuevo.nombre = nombre
  if (notify) nuevo.notify = notify
  if (nuevo.nombre === previo.nombre && nuevo.notify === previo.notify) return
  estado.contactos[jid] = nuevo
  guardarEstado()
  if (estado.chats[jid]) emitir('chat', vistaChat(estado.chats[jid]))
}

export const pnDeLid = (lid) => estado.lids[lid] || null

/* ---------------- Archivados, fijados y marcas de sincronización ---------------- */

export const estaArchivado = (jid) => !!estado.archivados[jid]
export const meta = () => estado.meta

export function setMeta(patch) {
  Object.assign(estado.meta, patch)
  guardarEstado()
}

export function setArchivado(jid, archivado) {
  if (!!estado.archivados[jid] === !!archivado) return false
  if (archivado) estado.archivados[jid] = true
  else delete estado.archivados[jid]
  guardarEstado()
  if (estado.chats[jid]) emitir('chat', vistaChat(estado.chats[jid]))
  return true
}

export function setFijado(jid, ts) {
  const valor = ts || null
  if ((estado.fijados[jid] || null) === valor) return false
  if (valor) estado.fijados[jid] = valor
  else delete estado.fijados[jid]
  guardarEstado()
  if (estado.chats[jid]) emitir('chat', vistaChat(estado.chats[jid]))
  return true
}

export const infoFoto = (jid) => estado.fotos[jid] || null

export function setFoto(jid, tiene) {
  const previo = estado.fotos[jid]
  estado.fotos[jid] = { tiene: !!tiene, ts: Date.now() }
  guardarEstado()
  if (estado.chats[jid] && (tiene || previo?.tiene)) emitir('chat', vistaChat(estado.chats[jid]))
}

/** WhatsApp manda el fin del silencio en segundos o milisegundos; -1 es "siempre". */
function silenciadoActivo(hasta) {
  if (!hasta) return false
  if (hasta < 0) return true
  return (hasta < 1e12 ? hasta * 1000 : hasta) > Date.now()
}

export function setSilenciado(jid, hasta) {
  const valor = hasta || null
  if ((estado.silenciados[jid] || null) === valor) return false
  if (valor) estado.silenciados[jid] = valor
  else delete estado.silenciados[jid]
  guardarEstado()
  if (estado.chats[jid]) emitir('chat', vistaChat(estado.chats[jid]))
  return true
}

export function contarMarcas() {
  const existe = (jid) => !!estado.chats[jid]
  return {
    archivados: Object.keys(estado.archivados).filter(existe).length,
    fijados: Object.keys(estado.fijados).filter(existe).length,
  }
}

/**
 * WhatsApp identifica a algunos contactos con un LID (id anónimo) en vez del
 * teléfono. Cuando se conoce el teléfono de un LID, el chat guardado con el LID
 * se mueve al teléfono para que no queden dos conversaciones de la misma persona.
 */
export function registrarLid(lid, pn) {
  if (!lid || !pn || estado.lids[lid] === pn) return
  estado.lids[lid] = pn
  if (estado.archivados[lid]) {
    estado.archivados[pn] = true
    delete estado.archivados[lid]
  }
  if (estado.fijados[lid]) {
    estado.fijados[pn] = estado.fijados[lid]
    delete estado.fijados[lid]
  }
  guardarEstado()

  const viejo = estado.chats[lid]
  if (!viejo) return
  const kv = clave(lid)
  const kn = clave(pn)
  const archivoViejo = path.join(MSG_DIR, `${kv}.jsonl`)
  if (fs.existsSync(archivoViejo)) {
    fs.appendFileSync(path.join(MSG_DIR, `${kn}.jsonl`), fs.readFileSync(archivoViejo))
    fs.rmSync(archivoViejo)
  }
  const mediaVieja = path.join(MEDIA_DIR, kv)
  if (fs.existsSync(mediaVieja)) {
    const mediaNueva = path.join(MEDIA_DIR, kn)
    fs.mkdirSync(mediaNueva, { recursive: true })
    for (const f of fs.readdirSync(mediaVieja)) fs.renameSync(path.join(mediaVieja, f), path.join(mediaNueva, f))
    fs.rmSync(mediaVieja, { recursive: true, force: true })
  }
  cache.delete(kv)
  cache.delete(kn)

  const actual = estado.chats[pn]
  const viejoMasNuevo = (viejo.ultimoTs || 0) > (actual?.ultimoTs || 0)
  estado.chats[pn] = {
    ...viejo,
    ...actual,
    id: pn,
    pushName: actual?.pushName || viejo.pushName,
    noLeidos: (viejo.noLeidos || 0) + (actual?.noLeidos || 0),
    ultimoTs: Math.max(viejo.ultimoTs || 0, actual?.ultimoTs || 0),
    ultimo: viejoMasNuevo ? viejo.ultimo : actual?.ultimo ?? viejo.ultimo,
  }
  delete estado.chats[lid]
  guardarEstado()
  emitir('chat-migrado', { de: lid, a: pn })
  emitir('chat', vistaChat(estado.chats[pn]))
}

/* ---------------- Chats ---------------- */

export function telefonoDe(jid) {
  const m = /^(\d+)@s\.whatsapp\.net$/.exec(jid || '')
  return m ? `+${m[1]}` : null
}

export function nombreDe(jid) {
  const c = estado.contactos[jid]
  return c?.nombre || estado.chats[jid]?.pushName || c?.notify || telefonoDe(jid) || jid.split('@')[0]
}

export function vistaChat(c) {
  return {
    ...c,
    nombre: nombreDe(c.id),
    telefono: telefonoDe(c.id),
    guardadoEnAgenda: !!estado.contactos[c.id]?.nombre,
    archivado: !!estado.archivados[c.id],
    fijado: estado.fijados[c.id] || null,
    silenciado: silenciadoActivo(estado.silenciados[c.id]),
    foto: estado.fotos[c.id]?.tiene ? estado.fotos[c.id].ts : null,
  }
}

export const existeChat = (jid) => !!estado.chats[jid]

// Cuenta de avisos del sistema de WhatsApp (códigos de seguridad, etc.): no es un contacto.
const OCULTOS = new Set(['0@s.whatsapp.net'])

export function listarChats() {
  return Object.values(estado.chats)
    .filter((c) => !OCULTOS.has(c.id))
    .sort((a, b) => (b.ultimoTs || 0) - (a.ultimoTs || 0))
    .map(vistaChat)
}

export function upsertChat(jid, patch = {}) {
  const previo = estado.chats[jid] || { id: jid, noLeidos: 0, ultimoTs: 0, ultimo: null }
  const chat = { ...previo, ...patch, id: jid }
  estado.chats[jid] = chat
  guardarEstado()
  emitir('chat', vistaChat(chat))
  return chat
}

export function sumarNoLeido(jid) {
  const chat = estado.chats[jid]
  if (chat) upsertChat(jid, { noLeidos: (chat.noLeidos || 0) + 1 })
}

export function marcarLeido(jid) {
  if (estado.chats[jid]?.noLeidos) upsertChat(jid, { noLeidos: 0 })
}

/* ---------------- Mensajes ---------------- */

const cache = new Map() // clave de chat → Map(id → mensaje)

function cargar(jid) {
  const k = clave(jid)
  if (cache.has(k)) return cache.get(k)
  const porId = new Map()
  const file = path.join(MSG_DIR, `${k}.jsonl`)
  if (fs.existsSync(file)) {
    for (const linea of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!linea.trim()) continue
      try {
        const op = JSON.parse(linea)
        if (op.op === 'add') porId.set(op.m.id, { ...porId.get(op.m.id), ...op.m })
        else if (op.op === 'upd' && porId.has(op.id)) Object.assign(porId.get(op.id), op.p)
      } catch {
        // Última línea incompleta por un cierre abrupto: se ignora.
      }
    }
  }
  cache.set(k, porId)
  return porId
}

function escribir(jid, op) {
  fs.appendFileSync(path.join(MSG_DIR, `${clave(jid)}.jsonl`), `${JSON.stringify(op)}\n`)
}

/** Lo que ve el navegador: sin el mensaje crudo de WhatsApp. */
export function vistaMensaje(m) {
  const { raw, ...resto } = m
  return resto
}

const resumen = (m) => ({
  id: m.id,
  tipo: m.tipo,
  texto: (m.texto || '').slice(0, 140),
  deMi: m.deMi,
  eliminado: !!m.eliminado,
  estado: m.estado || null,
})

export function listarMensajes(jid) {
  return [...cargar(jid).values()].sort((a, b) => a.ts - b.ts)
}

export const buscarMensaje = (jid, id) => cargar(jid).get(id) || null

/** Guarda un mensaje nuevo. Si ya existía (llega dos veces por historial y en vivo), solo completa campos vacíos. */
export function agregarMensaje(jid, m) {
  const porId = cargar(jid)
  const previo = porId.get(m.id)
  if (previo) {
    const faltantes = {}
    for (const [k, v] of Object.entries(m)) if (previo[k] == null && v != null) faltantes[k] = v
    if (Object.keys(faltantes).length) actualizarMensaje(jid, m.id, faltantes)
    return { nuevo: false, mensaje: previo }
  }
  porId.set(m.id, m)
  escribir(jid, { op: 'add', m })

  const chat = estado.chats[jid] || upsertChat(jid)
  if (m.ts >= (chat.ultimoTs || 0)) upsertChat(jid, { ultimoTs: m.ts, ultimo: resumen(m) })
  emitir('mensaje', { chatId: jid, mensaje: vistaMensaje(m) })
  return { nuevo: true, mensaje: m }
}

export function actualizarMensaje(jid, id, patch) {
  const m = cargar(jid).get(id)
  if (!m) return null
  Object.assign(m, patch)
  escribir(jid, { op: 'upd', id, p: patch })
  const chat = estado.chats[jid]
  if (chat?.ultimo?.id === id) upsertChat(jid, { ultimo: resumen(m) })
  emitir('mensaje', { chatId: jid, mensaje: vistaMensaje(m) })
  return m
}

/* ---------------- Multimedia ---------------- */

export function rutaMedia(jid, archivo) {
  const dir = path.join(MEDIA_DIR, clave(jid))
  const ruta = path.join(dir, path.basename(archivo))
  return { dir, ruta }
}

export function guardarMedia(jid, archivo, buffer) {
  const { dir, ruta } = rutaMedia(jid, archivo)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(ruta, buffer)
  return ruta
}

export const existeMedia = (jid, archivo) => !!archivo && fs.existsSync(rutaMedia(jid, archivo).ruta)

/* ---------------- Sesión y espacio usado ---------------- */

export function borrarSesion() {
  fs.rmSync(AUTH_DIR, { recursive: true, force: true })
}

function recorrer(dir, alArchivo) {
  if (!fs.existsSync(dir)) return
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) recorrer(p, alArchivo)
    else alArchivo(p, fs.statSync(p).size)
  }
}

const CATEGORIA = {
  fotos: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'],
  videos: ['mp4', '3gp', 'mov', 'mkv', 'webm'],
  audios: ['ogg', 'opus', 'mp3', 'm4a', 'aac', 'wav', 'amr'],
}

export function usoAlmacenamiento() {
  const media = { fotos: 0, videos: 0, audios: 0, documentos: 0 }
  recorrer(MEDIA_DIR, (p, size) => {
    const ext = path.extname(p).slice(1).toLowerCase()
    const cat = Object.keys(CATEGORIA).find((c) => CATEGORIA[c].includes(ext)) || 'documentos'
    media[cat] += size
  })
  let mensajesBytes = 0
  let mensajes = 0
  let eliminados = 0
  recorrer(MSG_DIR, (p, size) => {
    mensajesBytes += size
    const txt = fs.readFileSync(p, 'utf8')
    mensajes += (txt.match(/"op":"add"/g) || []).length
    eliminados += (txt.match(/"eliminado":\{/g) || []).length
  })
  let sesionBytes = 0
  recorrer(AUTH_DIR, (_, size) => (sesionBytes += size))
  return {
    chats: Object.keys(estado.chats).length,
    mensajes,
    eliminados,
    bytes: { mensajes: mensajesBytes, sesion: sesionBytes, media },
    carpeta: DATA_DIR,
  }
}
