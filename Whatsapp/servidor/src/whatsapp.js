/*
 * Conexión con WhatsApp (Baileys v7). Basado en components/bot/whatsapp.js del
 * bot de Electron: misma sesión en archivos, markOnlineOnConnect en false y
 * borrado de la sesión cuando WhatsApp la cierra. Lo nuevo:
 *  - solo chats 1 a 1 (grupos, estados y canales se ignoran)
 *  - guarda todos los mensajes y la multimedia en disco (almacen.js)
 *  - anti-borrado: "Eliminar para todos" marca el mensaje, nunca lo borra
 *  - ediciones: se guarda la versión anterior
 *  - reconexión con espera creciente en vez de reintentar cada 3 s
 */
import QRCode from 'qrcode'
import pino from 'pino'
import makeWASocket, {
  Browsers,
  BufferJSON,
  DisconnectReason,
  WAMessageStubType,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  generateMessageIDV2,
  getContentType,
  isJidBroadcast,
  isJidGroup,
  isJidMetaAI,
  isJidNewsletter,
  isLidUser,
  isPnUser,
  jidNormalizedUser,
  normalizeMessageContent,
  toNumber,
  useMultiFileAuthState,
} from 'baileys'
import { BAILEYS_LOG, MEDIA_MAX_BYTES, MEDIA_RECIENTE_SEG } from './config.js'
import { emitir, log } from './eventos.js'
import { aNotaDeVoz } from './audio.js'
import { configurarFotos, pedirFotos, pedirFotosDeTodos } from './fotos.js'
import {
  AUTH_DIR,
  actualizarMensaje,
  agregarMensaje,
  borrarSesion,
  buscarMensaje,
  config,
  existeChat,
  existeMedia,
  guardarMedia,
  listarMensajes,
  marcarLeido,
  nombreDe,
  pnDeLid,
  registrarLid,
  rutaMedia,
  setContacto,
  sumarNoLeido,
  telefonoDe,
  upsertChat,
  vistaMensaje,
  contarMarcas,
  estaArchivado,
  meta,
  setArchivado,
  setFijado,
  setMeta,
  setSilenciado,
} from './almacen.js'

const logger = pino({ level: BAILEYS_LOG })

let sock = null
let conexion = 'iniciando' // iniciando | conectando | qr | conectado | desconectado
let qrDataUrl = null
let yo = null
let intentos = 0
let reconectarTimer = null
let detenido = false

const enviados = new Map() // id → contenido, para reintentos que pide WhatsApp (getMessage)
const mediaPropia = new Map() // id → buffer de archivos enviados desde el panel (evita volver a descargarlos)
const descargando = new Set()
const pushNames = new Map()
let sincronizando = false
let authActual = null

const ESTADOS = { 0: 'error', 1: 'pendiente', 2: 'enviado', 3: 'entregado', 4: 'leido', 5: 'reproducido' }
const ORDEN = ['pendiente', 'enviado', 'entregado', 'leido', 'reproducido']
const ahora = () => Math.floor(Date.now() / 1000)

configurarFotos(() => (conexion === 'conectado' ? sock : null))

/* ---------------- Conexión ---------------- */

export const estadoConexion = () => ({ conexion, qr: qrDataUrl, yo, intentos })

function setConexion(nuevo) {
  conexion = nuevo
  if (nuevo !== 'qr') qrDataUrl = null
  emitir('estado', estadoConexion())
}

function programar(ms) {
  clearTimeout(reconectarTimer)
  reconectarTimer = setTimeout(() => {
    iniciar().catch((err) => {
      log('error', 'No se pudo iniciar WhatsApp', err.message)
      setConexion('desconectado')
    })
  }, ms)
}

export async function iniciar() {
  clearTimeout(reconectarTimer)
  detenido = false
  if (sock) {
    try {
      sock.ev.removeAllListeners()
      sock.end(undefined)
    } catch {}
    sock = null
  }
  setConexion('conectando')

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  authActual = state
  let version
  try {
    ;({ version } = await fetchLatestBaileysVersion())
  } catch {
    // Sin internet para consultar la versión: Baileys usa la que trae incorporada.
  }

  const s = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.windows('Chrome'),
    // Si se marca "en línea", el celular deja de recibir notificaciones.
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    shouldIgnoreJid: ignorar,
    getMessage: async (key) => enviados.get(key.id),
  })
  sock = s

  const seguro = (nombre, fn) => async (arg) => {
    if (s !== sock) return
    try {
      await fn(arg)
    } catch (err) {
      log('error', `Error procesando ${nombre}`, err.message)
    }
  }

  s.ev.on('creds.update', saveCreds)
  s.ev.on('connection.update', seguro('la conexión', (u) => alActualizarConexion(s, u)))
  s.ev.on('messaging-history.set', seguro('el historial', alHistorial))
  s.ev.on('messages.upsert', seguro('mensajes nuevos', async ({ messages, type }) => {
    for (const m of messages) await procesarEntrante(m, type)
  }))
  s.ev.on('messages.update', seguro('actualizaciones de mensajes', async (updates) => {
    for (const u of updates) await procesarActualizacion(u)
  }))
  s.ev.on('messages.reaction', seguro('reacciones', async (reacciones) => {
    for (const r of reacciones) await procesarReaccion(r)
  }))
  s.ev.on('messages.delete', seguro('borrados locales', () => {
    if (!sincronizando) log('info', 'WhatsApp pidió borrar mensajes de este dispositivo', 'Se ignoró: el respaldo los conserva')
  }))
  s.ev.on('chats.upsert', seguro('chats', procesarChats))
  s.ev.on('chats.update', seguro('chats', procesarChats))
  s.ev.on('presence.update', seguro('presencia', procesarPresencia))
  s.ev.on('contacts.upsert', seguro('contactos', (cs) => cs.forEach(guardarContacto)))
  s.ev.on('contacts.update', seguro('contactos', (cs) => cs.forEach(guardarContacto)))
  s.ev.on('lid-mapping.update', seguro('identificadores', registrarMapeo))
}

async function alActualizarConexion(s, { connection, lastDisconnect, qr }) {
  if (qr) {
    qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 8 })
    if (conexion !== 'qr') log('info', 'Código QR listo para escanear')
    conexion = 'qr'
    emitir('estado', estadoConexion())
  }

  if (connection === 'open') {
    intentos = 0
    const id = jidNormalizedUser(s.user?.id)
    yo = { id, nombre: s.user?.name || s.user?.verifiedName || null, telefono: telefonoDe(id) }
    if (s.user?.lid) registrarLid(jidNormalizedUser(s.user.lid), id)
    setConexion('conectado')
    log('ok', 'WhatsApp conectado', yo.telefono || id)
    // Una vez por sesión vinculada: trae del celular qué chats están archivados o fijados.
    if (!meta().chatsSincronizados) {
      setTimeout(() => {
        if (s !== sock || conexion !== 'conectado') return
        sincronizarChats().catch((err) => log('aviso', 'No se pudieron sincronizar los chats archivados', err.message))
      }, 8000)
    }
    // Fotos de perfil en segundo plano, cuando ya se calmó la sincronización inicial.
    setTimeout(() => {
      if (s === sock && conexion === 'conectado') pedirFotosDeTodos()
    }, 20000)
  }

  if (connection === 'close') {
    const codigo = lastDisconnect?.error?.output?.statusCode
    const motivo = lastDisconnect?.error?.message || 'sin detalle'
    sock = null
    if (detenido) return

    if (codigo === DisconnectReason.loggedOut || codigo === DisconnectReason.multideviceMismatch) {
      log('aviso', 'La sesión se cerró (desde el celular o desde el panel)', 'Hay que escanear el QR de nuevo')
      borrarSesion()
      setMeta({ chatsSincronizados: null })
      yo = null
      setConexion('conectando')
      programar(1000)
    } else if (codigo === DisconnectReason.restartRequired) {
      log('info', 'Reiniciando la conexión después de vincular')
      programar(0)
    } else if (codigo === DisconnectReason.connectionReplaced) {
      log('error', 'Otra conexión abrió esta misma sesión', 'Se frenó la reconexión automática. Cerrá el otro servicio y tocá Reconectar.')
      setConexion('desconectado')
    } else if (codigo === DisconnectReason.forbidden) {
      log('error', 'WhatsApp rechazó la conexión (403)', 'Puede ser un bloqueo del número: revisá el celular.')
      setConexion('desconectado')
    } else {
      intentos++
      const espera = Math.min(60000, 2000 * 2 ** Math.min(intentos - 1, 5))
      log('aviso', `Conexión perdida (${codigo ?? 'sin código'})`, `Reintento ${intentos} en ${Math.round(espera / 1000)} s · ${motivo}`)
      setConexion('conectando')
      programar(espera)
    }
  }
}

export async function pedirCodigo(telefono) {
  const digitos = String(telefono || '').replace(/\D/g, '')
  if (digitos.length < 10) throw new Error('Escribí el número completo con código de país, sin + ni espacios. Ej: 5493564562413')
  if (!sock || conexion !== 'qr') throw new Error('Esperá a que aparezca el código QR y volvé a intentar.')
  const codigo = await sock.requestPairingCode(digitos)
  log('info', 'Código de vinculación generado', `para +${digitos}`)
  return codigo
}

export async function desvincular() {
  log('aviso', 'Desvinculando la línea desde el panel')
  if (sock && conexion === 'conectado') {
    await sock.logout() // dispara connection.close con loggedOut → borra la sesión y muestra un QR nuevo
  } else {
    borrarSesion()
    yo = null
    await iniciar()
  }
}

export async function reconectar() {
  intentos = 0
  log('info', 'Reconexión manual')
  await iniciar()
}

export function detener() {
  detenido = true
  clearTimeout(reconectarTimer)
  try {
    sock?.end(undefined)
  } catch {}
}

/* ---------------- Identificación de chats ---------------- */

// Grupos, estados, canales, Meta AI y la cuenta de avisos del sistema no son conversaciones con clientes.
function ignorar(jid) {
  return !jid || jid === '0@s.whatsapp.net' || isJidGroup(jid) || isJidBroadcast(jid) || isJidNewsletter(jid) || isJidMetaAI(jid)
}

/** Devuelve el JID con teléfono cuando se conoce; si no, el LID. */
async function jidDelChat(key) {
  const principal = key.remoteJid
  const alterno = key.remoteJidAlt
  if (isPnUser(principal)) {
    if (alterno && isLidUser(alterno)) registrarLid(jidNormalizedUser(alterno), jidNormalizedUser(principal))
    return jidNormalizedUser(principal)
  }
  if (isLidUser(principal)) {
    const lid = jidNormalizedUser(principal)
    if (alterno && isPnUser(alterno)) {
      const pn = jidNormalizedUser(alterno)
      registrarLid(lid, pn)
      return pn
    }
    let pn = pnDeLid(lid)
    if (!pn) {
      try {
        const r = await sock?.signalRepository?.lidMapping?.getPNForLID(principal)
        if (r) {
          pn = jidNormalizedUser(r)
          registrarLid(lid, pn)
        }
      } catch {}
    }
    return pn || lid
  }
  return jidNormalizedUser(principal)
}

function aJid(valor) {
  if (!valor) return null
  if (/^\d+$/.test(valor)) return `${valor}@s.whatsapp.net`
  return jidNormalizedUser(valor)
}

function registrarMapeo(mapeos) {
  for (const m of [].concat(mapeos || [])) {
    const lid = aJid(m?.lid || m?.lidJid)
    const pn = aJid(m?.pn || m?.pnJid)
    if (lid && pn) registrarLid(lid, pn)
  }
}

function guardarContacto(c) {
  const ids = [c.id, c.phoneNumber, c.lid].map(aJid).filter(Boolean)
  const pn = ids.find((j) => isPnUser(j))
  const lid = ids.find((j) => isLidUser(j))
  if (pn && lid) registrarLid(lid, pn)
  const jid = pn || lid
  if (!jid) return
  setContacto(jid, { nombre: c.name, notify: c.notify || c.verifiedName })
}

function actualizarPushName(chatId, nombre) {
  if (!nombre || pushNames.get(chatId) === nombre) return
  pushNames.set(chatId, nombre)
  upsertChat(chatId, { pushName: nombre })
}

/* ---------------- Interpretación de mensajes ---------------- */

const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
  'application/pdf': 'pdf',
}

function extensionDe(mime = '', nombre = '') {
  const deNombre = /\.([a-z0-9]{1,5})$/i.exec(nombre || '')?.[1]
  if (deNombre) return deNombre.toLowerCase()
  const base = mime.split(';')[0].trim().toLowerCase()
  return MIME_EXT[base] || base.split('/')[1]?.replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
}

function textoDe(c) {
  if (!c) return ''
  return c.conversation || c.extendedTextMessage?.text || c.imageMessage?.caption || c.videoMessage?.caption || c.documentMessage?.caption || ''
}

const medio = (c, extra = {}) => ({ mime: c.mimetype || '', tamano: toNumber(c.fileLength) || null, ...extra, estado: 'pendiente' })

function interpretar(content) {
  const tipoWa = getContentType(content)
  const c = content?.[tipoWa]
  let r
  switch (tipoWa) {
    case 'conversation': r = { tipo: 'texto', texto: content.conversation }; break
    case 'extendedTextMessage': r = { tipo: 'texto', texto: c.text }; break
    case 'imageMessage': r = { tipo: 'imagen', texto: c.caption, media: medio(c) }; break
    case 'videoMessage': r = { tipo: c.gifPlayback ? 'gif' : 'video', texto: c.caption, media: medio(c, { segundos: c.seconds }) }; break
    case 'audioMessage': r = { tipo: c.ptt ? 'nota_voz' : 'audio', media: medio(c, { segundos: c.seconds }) }; break
    case 'documentMessage': r = { tipo: 'documento', texto: c.caption, media: medio(c, { nombre: c.fileName }) }; break
    case 'stickerMessage': r = { tipo: 'sticker', media: medio(c) }; break
    case 'locationMessage':
    case 'liveLocationMessage':
      r = { tipo: 'ubicacion', texto: c.name || c.address || '', ubicacion: { lat: c.degreesLatitude, lng: c.degreesLongitude } }
      break
    case 'contactMessage': r = { tipo: 'contacto', texto: c.displayName || 'Contacto' }; break
    case 'pollCreationMessage':
    case 'pollCreationMessageV2':
    case 'pollCreationMessageV3':
      r = { tipo: 'otro', texto: `Encuesta: ${c.name || ''}` }
      break
    default:
      r = tipoWa ? { tipo: 'otro', texto: `Mensaje no soportado (${tipoWa})` } : null
  }
  if (r && c?.contextInfo?.stanzaId) r.citado = c.contextInfo.stanzaId
  return r
}

/* ---------------- Eventos de mensajes ---------------- */

async function procesarEntrante(m, tipoUpsert, origen = 'vivo') {
  const key = m.key
  if (!key?.remoteJid || ignorar(key.remoteJid)) return
  const content = normalizeMessageContent(m.message)
  // Sin contenido: avisos del sistema o mensajes que no se pudieron descifrar.
  if (!content) return
  // Borrados, ediciones y reacciones llegan por messages.update / messages.reaction.
  if (content.protocolMessage || content.reactionMessage) return
  const datos = interpretar(content)
  if (!datos) return

  const chatId = await jidDelChat(key)
  const deMi = !!key.fromMe
  const ts = toNumber(m.messageTimestamp) || ahora()
  if (!deMi) actualizarPushName(chatId, m.pushName)

  const mensaje = { id: key.id, deMi, ts, ...datos, origen }
  if (deMi) mensaje.estado = ESTADOS[m.status] || 'enviado'

  if (datos.media) {
    // Se guarda el mensaje crudo para poder descargar el archivo más tarde.
    mensaje.raw = JSON.stringify({ key: m.key, message: m.message, messageTimestamp: m.messageTimestamp }, BufferJSON.replacer)
    const propio = mediaPropia.get(key.id)
    if (propio) {
      const archivo = `${key.id}.${extensionDe(datos.media.mime, datos.media.nombre)}`
      guardarMedia(chatId, archivo, propio)
      mensaje.media = { ...datos.media, archivo, tamano: propio.length, estado: 'ok' }
      mediaPropia.delete(key.id)
    }
  }

  const { nuevo, mensaje: guardado } = agregarMensaje(chatId, mensaje)
  if (!nuevo) return
  if (tipoUpsert === 'notify') pedirFotos([chatId])
  if (tipoUpsert === 'notify' && !deMi) {
    sumarNoLeido(chatId)
    // Igual que el celular: si la cuenta tiene activado "desarchivar al recibir mensajes", el chat vuelve a la lista.
    const creds = sock?.authState?.creds || authActual?.creds
    if (estaArchivado(chatId) && creds?.accountSettings?.unarchiveChats) setArchivado(chatId, false)
  }

  const reciente = ahora() - ts < MEDIA_RECIENTE_SEG
  if (guardado.media && guardado.media.estado !== 'ok' && config().descargarMedia && reciente) {
    await descargarMedia(chatId, guardado)
  }
}

async function procesarActualizacion({ key, update }) {
  if (!key?.remoteJid || ignorar(key.remoteJid)) return
  const chatId = await jidDelChat(key)

  if (update.message === null && update.messageStubType === WAMessageStubType.REVOKE) {
    marcarEliminado(chatId, key.id, update.key)
    return
  }

  const editado = update.message?.editedMessage?.message
  if (editado) {
    marcarEditado(chatId, key.id, normalizeMessageContent(editado), toNumber(update.messageTimestamp))
    return
  }

  if (update.status != null) {
    const nuevo = ESTADOS[update.status]
    const m = buscarMensaje(chatId, key.id)
    if (!m || !m.deMi || !nuevo) return
    if (nuevo === 'error' || ORDEN.indexOf(nuevo) > ORDEN.indexOf(m.estado)) actualizarMensaje(chatId, key.id, { estado: nuevo })
  }
}

function marcarEliminado(chatId, id, claveRevoke) {
  const por = claveRevoke?.fromMe ? 'yo' : 'contacto'
  const eliminado = { ts: ahora(), por }
  const m = buscarMensaje(chatId, id)
  if (m) {
    if (m.eliminado) return
    actualizarMensaje(chatId, id, { eliminado })
    log('aviso', por === 'yo' ? 'Se eliminó un mensaje enviado por la línea' : 'Un contacto eliminó un mensaje', `${nombreDe(chatId)} · el original quedó guardado`)
  } else {
    agregarMensaje(chatId, { id, deMi: por === 'yo', ts: eliminado.ts, tipo: 'desconocido', texto: '', eliminado, origen: 'vivo' })
    log('aviso', 'Se eliminó un mensaje que no estaba guardado', `${nombreDe(chatId)} · había llegado antes de conectar el sistema`)
  }
}

function marcarEditado(chatId, id, contenido, ts) {
  const m = buscarMensaje(chatId, id)
  const texto = textoDe(contenido)
  if (!m || texto === m.texto) return
  const ediciones = [...(m.ediciones || []), { texto: m.texto || '', ts: ts || ahora() }]
  actualizarMensaje(chatId, id, { texto, ediciones })
  log('info', 'Se editó un mensaje', `${nombreDe(chatId)} · la versión anterior quedó guardada`)
}

async function procesarReaccion({ key, reaction }) {
  const claveChat = reaction?.key?.remoteJid ? reaction.key : key
  if (!claveChat?.remoteJid || ignorar(claveChat.remoteJid)) return
  const chatId = await jidDelChat(claveChat)
  const m = buscarMensaje(chatId, key.id)
  if (!m) return
  const quien = reaction.key?.fromMe ? 'yo' : 'contacto'
  actualizarMensaje(chatId, key.id, { reacciones: { ...m.reacciones, [quien]: reaction.text || null } })
}

async function alHistorial({ chats = [], contacts = [], messages = [], lidPnMappings = [] }) {
  registrarMapeo(lidPnMappings)
  contacts.forEach(guardarContacto)
  for (const ch of chats) {
    if (ch.pnJid && ch.lidJid) registrarLid(jidNormalizedUser(ch.lidJid), jidNormalizedUser(ch.pnJid))
  }
  let individuales = 0
  for (const m of messages) {
    if (ignorar(m.key?.remoteJid)) continue
    individuales++
    await procesarEntrante(m, 'append', 'historial')
  }
  for (const ch of chats) {
    if (ignorar(ch.id) || !ch.unreadCount) continue
    const id = ch.pnJid ? jidNormalizedUser(ch.pnJid) : await jidDelChat({ remoteJid: ch.id })
    if (existeChat(id)) upsertChat(id, { noLeidos: ch.unreadCount })
  }
  await procesarChats(chats)
  if (individuales) log('info', 'Historial recibido de WhatsApp', `${individuales} mensajes de chats individuales`)
}

/* ---------------- Presencia ("en línea", "escribiendo…") ---------------- */

const presencias = new Map() // chatId → { estado, visto, ts }

async function procesarPresencia({ id, presences }) {
  if (!id || ignorar(id)) return
  const datos = Object.values(presences || {})[0]
  if (!datos) return
  const chatId = await jidDelChat({ remoteJid: id })
  const p = { estado: datos.lastKnownPresence, visto: datos.lastSeen || null, ts: ahora() }
  presencias.set(chatId, p)
  emitir('presencia', { chatId, ...p })
}

/** Pide a WhatsApp los avisos de "en línea" y "escribiendo…" de un chat (se llama al abrirlo). */
export async function suscribirPresencia(chatId) {
  pedirFotos([chatId], { urgente: true })
  if (sock && conexion === 'conectado') await sock.presenceSubscribe(chatId)
  return presencias.get(chatId) || null
}

/* ---------------- Archivados y fijados ---------------- */

async function procesarChats(chats) {
  for (const ch of chats || []) {
    if (!ch?.id) continue
    const cambiaArchivo = typeof ch.archived === 'boolean'
    const cambiaFijado = 'pinned' in ch
    const cambiaSilencio = 'muteEndTime' in ch
    if (!cambiaArchivo && !cambiaFijado && !cambiaSilencio) continue
    if (ch.pnJid && ch.lidJid) registrarLid(jidNormalizedUser(ch.lidJid), jidNormalizedUser(ch.pnJid))
    if (ignorar(ch.id)) continue
    const id = ch.pnJid ? jidNormalizedUser(ch.pnJid) : await jidDelChat({ remoteJid: ch.id })
    if (ignorar(id)) continue
    if (cambiaArchivo) setArchivado(id, ch.archived)
    if (cambiaFijado) setFijado(id, ch.pinned ? toNumber(ch.pinned) : null)
    if (cambiaSilencio) setSilenciado(id, ch.muteEndTime ? toNumber(ch.muteEndTime) : null)
  }
}

/**
 * Vuelve a bajar de WhatsApp el estado de los chats (archivados, fijados) y los nombres
 * de la agenda. Borra la versión guardada para que WhatsApp mande la foto completa y no
 * solo los cambios nuevos. Se pide como sincronización normal: en modo "inicial" Baileys
 * retiene los archivados con una condición que en este caso nunca se cumple.
 */
export async function sincronizarChats() {
  asegurarConectado()
  if (sincronizando) throw new Error('Ya hay una sincronización en curso')
  sincronizando = true
  const colecciones = ['regular_high', 'regular_low', 'critical_unblock_low']
  log('info', 'Sincronizando chats archivados, fijados, silenciados y contactos')
  try {
    const keys = sock.authState?.keys || authActual?.keys
    if (!keys || typeof sock.resyncAppState !== 'function') throw new Error('Esta versión de Baileys no permite sincronizar chats')
    await keys.set({ 'app-state-sync-version': Object.fromEntries(colecciones.map((c) => [c, null])) })
    await conTimeout(sock.resyncAppState(colecciones, false), 120000, 'WhatsApp tardó demasiado en responder. Probá de nuevo en un rato.')
    // Los eventos se procesan apenas termina la sincronización: se espera un momento antes de contar.
    await new Promise((r) => setTimeout(r, 1500))
    setMeta({ chatsSincronizados: Date.now() })
    const r = contarMarcas()
    log('ok', 'Chats sincronizados', `${r.archivados} archivados · ${r.fijados} fijados`)
    return r
  } finally {
    sincronizando = false
  }
}

/* ---------------- Multimedia ---------------- */

// Enlace vencido o archivo borrado de los servidores de WhatsApp: hay que pedirle al celular que lo reenvíe.
// (Baileys rc14 no lo hace solo: busca error.status, pero su propio error trae output.statusCode.)
const REQUIERE_REENVIO = [403, 404, 410]
const REENVIO_TIMEOUT_MS = 30000

function conTimeout(promesa, ms, mensaje) {
  let timer
  const limite = new Promise((_, rechazar) => {
    timer = setTimeout(() => rechazar(new Error(mensaje)), ms)
  })
  return Promise.race([promesa, limite]).finally(() => clearTimeout(timer))
}

function mensajeDeError(err, huboReenvio) {
  const texto = err?.message || String(err)
  if (/re-upload failed by device/i.test(texto)) return 'El celular ya no tiene este archivo (se borró del teléfono o nunca se descargó ahí).'
  if (/Failed to fetch stream/i.test(texto)) {
    return huboReenvio
      ? 'WhatsApp no entregó el archivo ni después de pedirle al celular que lo reenvíe.'
      : 'El enlace del archivo en WhatsApp ya no funciona.'
  }
  return texto.replace(/https?:\/\/\S+/g, '').trim()
}

async function descargarMedia(chatId, m) {
  if (!m.raw || descargando.has(m.id)) return m
  if (m.media?.tamano && m.media.tamano > MEDIA_MAX_BYTES) {
    return actualizarMensaje(chatId, m.id, { media: { ...m.media, estado: 'grande' } })
  }
  descargando.add(m.id)
  // Solo avisa a la pantalla; no se guarda en disco para no dejar "descargando" colgado si se corta.
  emitir('mensaje', { chatId, mensaje: vistaMensaje({ ...m, media: { ...m.media, estado: 'descargando' } }) })
  let huboReenvio = false
  try {
    let wa = JSON.parse(m.raw, BufferJSON.reviver)
    let buffer
    try {
      buffer = await downloadMediaMessage(wa, 'buffer', {})
    } catch (err) {
      const codigo = err?.output?.statusCode ?? err?.status
      if (!REQUIERE_REENVIO.includes(codigo)) throw err
      if (!sock || conexion !== 'conectado') throw new Error('El enlace venció y WhatsApp no está conectado para pedir el reenvío.')
      huboReenvio = true
      wa = await conTimeout(
        sock.updateMediaMessage(wa),
        REENVIO_TIMEOUT_MS,
        'El celular no respondió al pedido de reenvío. Revisá que tenga internet y volvé a intentar.',
      )
      buffer = await downloadMediaMessage(wa, 'buffer', {})
      // El reenvío trae un enlace nuevo: se guarda para no tener que pedirlo otra vez.
      actualizarMensaje(chatId, m.id, {
        raw: JSON.stringify({ key: wa.key, message: wa.message, messageTimestamp: wa.messageTimestamp }, BufferJSON.replacer),
      })
    }
    const archivo = `${m.id}.${extensionDe(m.media.mime, m.media.nombre)}`
    guardarMedia(chatId, archivo, buffer)
    return actualizarMensaje(chatId, m.id, { media: { ...m.media, archivo, tamano: buffer.length, estado: 'ok', error: null } })
  } catch (err) {
    const error = mensajeDeError(err, huboReenvio)
    const actual = buscarMensaje(chatId, m.id)
    if (actual?.media?.estado === 'error' && actual.media.error === error) {
      emitir('mensaje', { chatId, mensaje: vistaMensaje(actual) })
      return actual
    }
    log('aviso', 'No se pudo descargar un archivo', `${nombreDe(chatId)} · ${error}`)
    return actualizarMensaje(chatId, m.id, { media: { ...m.media, estado: 'error', error } })
  } finally {
    descargando.delete(m.id)
  }
}

/** Ruta del archivo ya descargado. No descarga nada: eso lo pide el usuario con descargarAhora. */
export function obtenerMedia(chatId, id) {
  const m = buscarMensaje(chatId, id)
  if (!m?.media?.archivo || !existeMedia(chatId, m.media.archivo)) {
    throw Object.assign(new Error('El archivo todavía no está descargado'), { status: 404 })
  }
  return { ruta: rutaMedia(chatId, m.media.archivo).ruta, mime: m.media.mime, nombre: m.media.nombre }
}

/** Descarga (o reintenta) el archivo de un mensaje cuando el usuario lo pide. */
export async function descargarAhora(chatId, id) {
  const m = buscarMensaje(chatId, id)
  if (!m?.media) throw Object.assign(new Error('El mensaje no tiene archivo'), { status: 404 })
  if (existeMedia(chatId, m.media.archivo)) return vistaMensaje(m)
  if (!m.raw) throw new Error('No hay datos guardados para descargar este archivo')
  const resultado = await descargarMedia(chatId, m)
  return vistaMensaje(resultado || buscarMensaje(chatId, id))
}

/* ---------------- Envíos ---------------- */

function asegurarConectado() {
  if (!sock || conexion !== 'conectado') throw new Error('WhatsApp no está conectado. Vinculá la línea en la pestaña Conexión.')
}

async function enviar(chatId, contenido, buffer, quoted) {
  asegurarConectado()
  const messageId = generateMessageIDV2(sock.user?.id)
  if (buffer) mediaPropia.set(messageId, buffer)
  try {
    const enviado = await sock.sendMessage(chatId, contenido, { messageId, quoted })
    if (enviado?.message) {
      enviados.set(enviado.key.id, enviado.message)
      if (enviados.size > 500) enviados.delete(enviados.keys().next().value)
    }
    // Normalmente ya lo guardó messages.upsert; esto cubre el caso en que no llegue.
    if (enviado && !buscarMensaje(chatId, enviado.key.id)) await procesarEntrante(enviado, 'append')
    return enviado?.key?.id
  } finally {
    setTimeout(() => mediaPropia.delete(messageId), 60000)
  }
}

/** Mensaje a citar, armado con lo guardado: Baileys necesita la clave y el contenido original. */
function mensajeCitado(chatId, id) {
  const m = id ? buscarMensaje(chatId, id) : null
  if (!m) return undefined
  const message = m.raw ? JSON.parse(m.raw, BufferJSON.reviver).message : { conversation: m.texto || '' }
  return { key: { remoteJid: chatId, id: m.id, fromMe: !!m.deMi }, message }
}

export function enviarTexto(chatId, texto, citadoId) {
  const limpio = String(texto || '').trim()
  if (!limpio) throw new Error('El mensaje está vacío')
  return enviar(chatId, { text: limpio }, undefined, mensajeCitado(chatId, citadoId))
}

/** Reacciona a un mensaje. Un emoji vacío quita la reacción. */
export async function enviarReaccion(chatId, id, emoji) {
  asegurarConectado()
  const m = buscarMensaje(chatId, id)
  if (!m) throw Object.assign(new Error('El mensaje no existe'), { status: 404 })
  const texto = emoji || ''
  await sock.sendMessage(chatId, { react: { text: texto, key: { remoteJid: chatId, id: m.id, fromMe: !!m.deMi } } })
  return vistaMensaje(actualizarMensaje(chatId, id, { reacciones: { ...m.reacciones, yo: texto || null } }))
}

export function enviarArchivo(chatId, buffer, { mime, nombre, caption }) {
  const base = (mime || 'application/octet-stream').split(';')[0].trim().toLowerCase()
  const texto = caption || undefined
  let contenido
  if (/^image\/(jpeg|png|webp)$/.test(base)) contenido = { image: buffer, caption: texto, mimetype: base }
  else if (base === 'video/mp4') contenido = { video: buffer, caption: texto, mimetype: base }
  else if (base.startsWith('audio/')) contenido = { audio: buffer, mimetype: base }
  else contenido = { document: buffer, mimetype: base, fileName: nombre || 'archivo', caption: texto }
  return enviar(chatId, contenido, buffer)
}

export async function enviarNotaDeVoz(chatId, buffer, segundos) {
  asegurarConectado()
  const ogg = await aNotaDeVoz(buffer)
  const contenido = { audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true }
  if (segundos > 0) contenido.seconds = Math.round(segundos)
  return enviar(chatId, contenido, ogg)
}

/** Abre (o crea) un chat con un número que puede no haber escrito nunca. */
export async function abrirChat(telefono) {
  asegurarConectado()
  const digitos = String(telefono || '').replace(/\D/g, '')
  if (digitos.length < 10) throw new Error('Escribí el número con código de país, sin + ni espacios. Ej: 5493564562413')
  const [r] = await sock.onWhatsApp(digitos)
  if (!r?.exists) throw new Error(`El número +${digitos} no tiene WhatsApp`)
  let id = jidNormalizedUser(r.jid)
  if (isLidUser(id)) id = pnDeLid(id) || `${digitos}@s.whatsapp.net`
  if (!existeChat(id)) upsertChat(id, { ultimoTs: ahora() })
  return id
}

export async function confirmarLectura(chatId) {
  marcarLeido(chatId)
  if (!config().confirmarLectura || !sock || conexion !== 'conectado') return
  const recibidos = listarMensajes(chatId).filter((m) => !m.deMi && m.tipo !== 'desconocido').slice(-20)
  if (recibidos.length) await sock.readMessages(recibidos.map((m) => ({ remoteJid: chatId, id: m.id, fromMe: false })))
}
