/*
 * Almacén de chats, contactos y mensajes. Dos modos (ALMACEN en config.js):
 *
 *   supabase  todo en la base (esquema "wa"): al arrancar se carga a memoria y los
 *             cambios se escriben en tandas (ver nube.js).
 *   local     archivos en data/, para pruebas. Estructura:
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
 * En los dos modos, la sesión de WhatsApp (data/sesion) queda en disco. Los archivos
 * multimedia van a Cloudflare R2 o a data/media (ver archivos.js). El resto del
 * servidor no sabe en qué modo está.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ALMACEN, ARCHIVOS_EN_R2, DATA_DIR } from './config.js'
import { emitir, log } from './eventos.js'
import * as nube from './nube.js'
import { DONDE, enDisco, guardar, listarArchivos, moverPrefijo } from './archivos.js'

export const EN_SUPABASE = ALMACEN === 'supabase'

export const AUTH_DIR = path.join(DATA_DIR, 'sesion')
const MSG_DIR = path.join(DATA_DIR, 'mensajes')
const MEDIA_DIR = path.join(DATA_DIR, 'media')
const ESTADO_FILE = path.join(DATA_DIR, 'estado.json')

for (const dir of [DATA_DIR, MSG_DIR, MEDIA_DIR]) fs.mkdirSync(dir, { recursive: true })

const CONFIG_INICIAL = { descargarMedia: true, confirmarLectura: false }

const estado = EN_SUPABASE ? {} : leerJson(ESTADO_FILE, {})
function completarEstado() {
  estado.chats ??= {}
  estado.contactos ??= {}
  estado.lids ??= {}
  estado.archivados ??= {}
  estado.fijados ??= {}
  estado.meta ??= {}
  estado.fotos ??= {}
  estado.carpetas ??= {}
  estado.silenciados ??= {}
  estado.config = { ...CONFIG_INICIAL, ...estado.config }
}
completarEstado()

/**
 * Deja el almacén listo. En modo supabase trae todo de la base a memoria; hay que
 * esperarlo antes de conectar WhatsApp.
 */
export async function iniciarAlmacen() {
  if (!EN_SUPABASE) return { modo: 'local', chats: Object.keys(estado.chats).length }
  const { estado: guardado, mensajes } = await nube.cargarTodo()
  Object.assign(estado, guardado)
  completarEstado()
  cache.clear()
  let total = 0
  for (const [jid, porId] of mensajes) {
    cache.set(clave(jid), porId)
    total += porId.size
  }
  nube.conectarAlmacen(() => ({ estado, mensajes: (jid) => cache.get(clave(jid)) }))
  return { modo: 'supabase', chats: Object.keys(estado.chats).length, mensajes: total }
}

/** Escribe lo pendiente antes de apagar (solo modo supabase). */
export const cerrarAlmacen = () => (EN_SUPABASE ? nube.cerrar() : Promise.resolve())

function leerJson(file, porDefecto) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return porDefecto
  }
}

let guardarTimer
function guardarEstado() {
  if (EN_SUPABASE) return nube.estadoCambiado()
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
  if (EN_SUPABASE) nube.contactoCambiado(jid)
  if (estado.chats[jid]) emitir('chat', vistaChat(estado.chats[jid]))
}

export const pnDeLid = (lid) => estado.lids[lid] || null

/* ---------------- Archivados, fijados y marcas de sincronización ---------------- */

export const estaArchivado = (jid) => !!estado.archivados[jid]
export const fijadoDe = (jid) => estado.fijados[jid] || null
export const silenciadoDe = (jid) => estado.silenciados[jid] || null
export const buscarChat = (jid) => estado.chats[jid] || null
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
  if (EN_SUPABASE && estado.chats[jid]) nube.chatCambiado(jid)
  if (estado.chats[jid]) emitir('chat', vistaChat(estado.chats[jid]))
  return true
}

export function setFijado(jid, ts) {
  const valor = ts || null
  if ((estado.fijados[jid] || null) === valor) return false
  if (valor) estado.fijados[jid] = valor
  else delete estado.fijados[jid]
  guardarEstado()
  if (EN_SUPABASE && estado.chats[jid]) nube.chatCambiado(jid)
  if (estado.chats[jid]) emitir('chat', vistaChat(estado.chats[jid]))
  return true
}

export const infoFoto = (jid) => estado.fotos[jid] || null

/** Chats y contactos que figuran con foto de perfil guardada. */
export const conFotoGuardada = () => Object.keys(estado.fotos).filter((jid) => estado.fotos[jid]?.tiene)

export function setFoto(jid, tiene) {
  const previo = estado.fotos[jid]
  const ts = Date.now()
  estado.fotos[jid] = { tiene: !!tiene, ts }
  guardarEstado()
  if (estado.chats[jid] && (tiene || previo?.tiene)) emitir('chat', vistaChat(estado.chats[jid]))
  // También para quien no tiene chat propio: los integrantes de un grupo en la ficha.
  if (tiene && !previo?.tiene) emitir('foto', { id: jid, ts })
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
  if (EN_SUPABASE && estado.chats[jid]) nube.chatCambiado(jid)
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
  if (EN_SUPABASE) {
    // Los mensajes del chat con LID pasan al del teléfono; el viejo se borra de la base.
    const destino = cargarClave(kn)
    for (const [id, m] of cargarClave(kv)) {
      destino.set(id, { ...destino.get(id), ...m })
      nube.mensajeCambiado(pn, id)
    }
    cache.delete(kv)
    nube.chatBorrado(lid)
  }
  const archivoViejo = path.join(MSG_DIR, `${kv}.jsonl`)
  if (!EN_SUPABASE && fs.existsSync(archivoViejo)) {
    fs.appendFileSync(path.join(MSG_DIR, `${kn}.jsonl`), fs.readFileSync(archivoViejo))
    fs.rmSync(archivoViejo)
  }
  // Los archivos del chat viejo pasan a la carpeta del nuevo (en R2 es copiar y borrar: va en segundo plano).
  const carpetaVieja = estado.carpetas[lid] || kv
  delete estado.carpetas[lid]
  moverPrefijo(`media/${carpetaVieja}`, `media/${asignarCarpeta(pn)}`).catch((err) =>
    log('aviso', 'No se pudieron mover los archivos de un chat unificado', err.message),
  )
  if (!EN_SUPABASE) {
    cache.delete(kv)
    cache.delete(kn)
  }

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
  if (EN_SUPABASE) nube.chatCambiado(pn)
  emitir('chat-migrado', { de: lid, a: pn })
  emitir('chat', vistaChat(estado.chats[pn]))
}

/* ---------------- Chats ---------------- */

export function telefonoDe(jid) {
  const m = /^(\d+)@s\.whatsapp\.net$/.exec(jid || '')
  return m ? `+${m[1]}` : null
}

/** Se mira el sufijo en vez de usar Baileys: este módulo no depende de la librería. */
export const esGrupo = (jid) => !!jid && jid.endsWith('@g.us')

export function nombreDe(jid) {
  // Un grupo se llama por su asunto; el pushName de un mensaje es del autor, no del chat.
  if (esGrupo(jid)) return estado.chats[jid]?.grupoNombre || 'Grupo'
  const c = estado.contactos[jid]
  return c?.nombre || estado.chats[jid]?.pushName || c?.notify || telefonoDe(jid) || jid.split('@')[0]
}

/** Guarda el asunto del grupo que informa WhatsApp. */
export function setGrupoNombre(jid, nombre) {
  if (!nombre || !estado.chats[jid] || estado.chats[jid].grupoNombre === nombre) return false
  upsertChat(jid, { grupoNombre: nombre })
  return true
}

export function vistaChat(c) {
  return {
    ...c,
    nombre: nombreDe(c.id),
    telefono: telefonoDe(c.id),
    esGrupo: esGrupo(c.id),
    guardadoEnAgenda: !!estado.contactos[c.id]?.nombre,
    // El nombre que la persona se puso en WhatsApp. Llega por la agenda (notify) o con
    // sus mensajes (pushName); el panel lo muestra debajo del número si no está agendada.
    notify: estado.contactos[c.id]?.notify || null,
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
  if (EN_SUPABASE) nube.chatCambiado(jid)
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

const cargar = (jid) => cargarClave(clave(jid))

/** Resuelve un archivo .jsonl a Map(id → mensaje) aplicando las líneas en orden. */
function cargarClave(k) {
  if (cache.has(k)) return cache.get(k)
  const porId = new Map()
  const file = path.join(MSG_DIR, `${k}.jsonl`)
  if (!EN_SUPABASE && fs.existsSync(file)) {
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
  if (EN_SUPABASE) return nube.mensajeCambiado(jid, op.m?.id ?? op.id)
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
  autorNombre: m.autorNombre || null,
  eliminado: !!m.eliminado,
  estado: m.estado || null,
})

export function listarMensajes(jid) {
  return [...cargar(jid).values()].sort((a, b) => a.ts - b.ts)
}

export const buscarMensaje = (jid, id) => cargar(jid).get(id) || null

/**
 * ¿Escribió la otra persona después de `idsCorte`? Es la regla de WhatsApp para saber si
 * un chat archivado vuelve a la bandeja. El corte es un mensaje, no una hora: la hora que
 * informa WhatsApp puede diferir en minutos de la del mensaje guardado.
 * Devuelve null si el mensaje de corte no está guardado (no se puede saber).
 * Lee el archivo sin dejarlo en memoria: se usa para muchos chats de una vez.
 */
export function recibioDespuesDe(jid, idsCorte) {
  const k = clave(jid)
  let mensajes
  if (cache.has(k)) {
    mensajes = [...cache.get(k).values()].map((m) => ({ id: m.id, ts: m.ts, deMi: m.deMi, tipo: m.tipo, raw: m.raw }))
  } else {
    const file = path.join(MSG_DIR, `${k}.jsonl`)
    if (!fs.existsSync(file)) return null
    mensajes = []
    for (const linea of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!linea.includes('"op":"add"')) continue
      try {
        const { id, ts, deMi, tipo, raw } = JSON.parse(linea).m
        mensajes.push({ id, ts, deMi, tipo, raw })
      } catch {
        // Línea incompleta: se ignora.
      }
    }
  }
  const ids = new Set(idsCorte)
  let corte = null
  for (const m of mensajes) if (ids.has(m.id) && (corte === null || m.ts > corte)) corte = m.ts
  if (corte === null) return null
  // Un álbum llega como un mensaje "álbum" y después cada foto por separado, apuntando al
  // álbum o a otra foto del mismo álbum. Si el corte es el álbum, toda esa cadena es el
  // mismo envío y no cuenta como mensaje nuevo.
  const posteriores = mensajes.filter((m) => m.ts > corte && !ids.has(m.id)).sort((a, b) => a.ts - b.ts)
  for (const m of posteriores) {
    if (m.raw && [...ids].some((id) => m.raw.includes(id))) ids.add(m.id)
    // El aviso de un mensaje borrado no es un mensaje nuevo: WhatsApp no desarchiva por eso.
    else if (!m.deMi && m.tipo !== 'desconocido') return true
  }
  return false
}

/** Guarda un mensaje nuevo. Si ya existía (llega dos veces por historial y en vivo), solo completa campos vacíos. */
/** Recorre todos los mensajes guardados: fn(jid del chat, mensaje). */
export function recorrerMensajes(fn) {
  for (const jid of Object.keys(estado.chats)) for (const m of cargar(jid).values()) fn(jid, m)
}

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

/* ---------------- Búsqueda ---------------- */

/** Sin acentos y en minúsculas, para que "amarok" encuentre "Amárok". */
const normalizar = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/**
 * Busca texto en los mensajes. Sin `jid` busca en todos los chats.
 *
 * Leer todos los chats los dejaría cargados en memoria para siempre, así que el cache
 * se devuelve como estaba: solo sobreviven los que ya estaban abiertos.
 */
export function buscarMensajes(consulta, { jid = null, limite = 80 } = {}) {
  const q = normalizar(consulta)
  if (q.length < 2) return { resultados: [], truncado: false }

  const claves = jid ? [clave(jid)] : Object.keys(estado.chats).map(clave)
  const porClave = new Map(Object.keys(estado.chats).map((j) => [clave(j), j]))
  const cacheados = new Set(cache.keys())
  const resultados = []

  for (const k of claves) {
    const chatJid = porClave.get(k)
    if (!chatJid || OCULTOS.has(chatJid)) continue
    for (const m of cargarClave(k).values()) {
      if (!m.texto || !normalizar(m.texto).includes(q)) continue
      resultados.push({ chatId: chatJid, ...vistaMensaje(m) })
    }
    // En modo local no se deja todo cargado; en supabase la memoria ES el almacén.
    if (!EN_SUPABASE && !cacheados.has(k)) cache.delete(k)
  }

  resultados.sort((a, b) => b.ts - a.ts)
  return { resultados: resultados.slice(0, limite), truncado: resultados.length > limite, total: resultados.length }
}

/* ---------------- Multimedia ---------------- */

/*
 * Cada chat guarda sus archivos en una carpeta con el nombre del contacto y su número,
 * "Uli Avendaño (+5493406643845)", o "Grupo <asunto> (<id>)" para los grupos. El número
 * va siempre: dos contactos pueden llamarse igual. El nombre se fija la primera vez que
 * se guarda un archivo del chat y no cambia aunque el contacto se cambie el nombre, así
 * nada queda en una carpeta vieja. Los chats sin carpeta asignada usan la de antes
 * (media/<jid>), hasta que organizarCarpetas los pasa al formato nuevo.
 */
function nombreCarpeta(jid) {
  // Sin barras (separan carpetas), caracteres de control ni los que Windows no acepta en
  // un nombre de carpeta (sin R2 los archivos van al disco); espacios simples, largo acotado.
  const limpiar = (s) =>
    String(s || '')
      .replace(/[\p{Cc}/\\:*?"<>|]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60)
      .replace(/[. ]+$/, '')
  const id = jid.split('@')[0]
  if (esGrupo(jid)) return `Grupo ${limpiar(estado.chats[jid]?.grupoNombre) || 'sin nombre'} (${id})`
  const numero = telefonoDe(jid) || id
  const nombre = limpiar(nombreDe(jid))
  return nombre && nombre !== numero ? `${nombre} (${numero})` : numero
}

/** Carpeta de los archivos del chat; la asigna (y la recuerda) si todavía no tiene. */
function asignarCarpeta(jid) {
  if (!estado.carpetas[jid]) {
    estado.carpetas[jid] = nombreCarpeta(jid)
    guardarEstado()
  }
  return estado.carpetas[jid]
}

/** Clave del archivo de un mensaje: media/<carpeta del chat>/<id>.<ext> (en R2 o en el disco). */
export const claveMedia = (jid, archivo) => `media/${estado.carpetas[jid] || clave(jid)}/${path.basename(archivo)}`

export function guardarMedia(jid, archivo, buffer, mime) {
  asignarCarpeta(jid)
  return guardar(claveMedia(jid, archivo), buffer, mime)
}

/**
 * Pasa las carpetas del formato viejo (media/<jid>) al nuevo, con el nombre del contacto.
 * Se corre al arrancar, antes de conectar, así ningún archivo nuevo cae en la carpeta vieja.
 */
export async function organizarCarpetas() {
  const existentes = new Set((await listarArchivos('media/')).map((a) => a.clave.split('/')[1]))
  let movidas = 0
  for (const jid of Object.keys(estado.chats)) {
    if (estado.carpetas[jid] || !existentes.has(clave(jid))) continue
    const nueva = nombreCarpeta(jid)
    await moverPrefijo(`media/${clave(jid)}`, `media/${nueva}`)
    estado.carpetas[jid] = nueva
    movidas++
  }
  if (movidas) guardarEstado()
  return movidas
}

/**
 * Si el archivo del mensaje ya está guardado. En R2 no se pregunta uno por uno (sería un
 * pedido por archivo): el mensaje solo tiene `archivo` cuando se guardó bien.
 */
export const existeMedia = (jid, archivo) =>
  !!archivo && (ARCHIVOS_EN_R2 || fs.existsSync(enDisco(claveMedia(jid, archivo))))

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

export async function usoAlmacenamiento() {
  const media = { fotos: 0, videos: 0, audios: 0, documentos: 0 }
  for (const { clave: c, tamano } of await listarArchivos('media/')) {
    const ext = path.extname(c).slice(1).toLowerCase()
    const cat = Object.keys(CATEGORIA).find((k) => CATEGORIA[k].includes(ext)) || 'documentos'
    media[cat] += tamano
  }
  let mensajesBytes = 0
  let mensajes = 0
  let eliminados = 0
  if (EN_SUPABASE) {
    for (const porId of cache.values()) {
      mensajes += porId.size
      for (const m of porId.values()) if (m.eliminado) eliminados++
    }
    mensajesBytes = await nube.tamanos().then((t) => t.mensajes + t.resto).catch(() => 0)
  } else recorrer(MSG_DIR, (p, size) => {
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
    carpeta: `${EN_SUPABASE ? 'Mensajes en Supabase (esquema wa)' : `Mensajes en ${DATA_DIR}`} · archivos en ${DONDE}`,
    almacen: ALMACEN,
    pendientesDeGuardar: EN_SUPABASE ? nube.pendientesDeGuardar() : 0,
  }
}

/* ---------------- Importar lo local a Supabase ---------------- */

/** Todo lo que hay en los archivos locales, para subirlo a Supabase. Solo en modo local. */
export function volcarLocal() {
  if (EN_SUPABASE) throw new Error('volcarLocal se usa con ALMACEN=local')
  const mensajes = new Map()
  for (const jid of Object.keys(estado.chats)) mensajes.set(jid, cargar(jid))
  return { estado, mensajes }
}
