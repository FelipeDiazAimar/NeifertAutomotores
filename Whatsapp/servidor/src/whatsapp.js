/*
 * Conexión con WhatsApp (Baileys v7). Basado en components/bot/whatsapp.js del
 * bot de Electron: misma sesión en archivos, markOnlineOnConnect en false y
 * borrado de la sesión cuando WhatsApp la cierra. Lo nuevo:
 *  - chats 1 a 1 y grupos (estados, canales y Meta AI se ignoran)
 *  - en los grupos se guarda quién escribió cada mensaje y el nombre del grupo
 *  - guarda todos los mensajes y la multimedia en disco (almacen.js)
 *  - anti-borrado: "Eliminar para todos" marca el mensaje, nunca lo borra
 *  - ediciones: se guarda la versión anterior
 *  - reconexión con espera creciente en vez de reintentar cada 3 s
 */
import fs from 'node:fs'
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
import { ARCHIVOS_ENV, BAILEYS_LOG, MEDIA_MAX_BYTES, MEDIA_RECIENTE_SEG, numeroLinea } from './config.js'
import { emitir, log } from './eventos.js'
import { sinUsuario, usuarioActual } from './auth.js'
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
  claveMedia,
  setContacto,
  setGrupoNombre,
  sumarNoLeido,
  telefonoDe,
  upsertChat,
  vistaMensaje,
  contarMarcas,
  estaArchivado,
  buscarChat,
  esGrupo,
  fijadoDe,
  infoFoto,
  meta,
  setArchivado,
  setFijado,
  setMeta,
  setSilenciado,
  silenciadoDe,
  recibioDespuesDe,
  vistaChat,
} from './almacen.js'

/*
 * Hasta cuándo vale cada archivado. Con "desarchivar al recibir mensajes" activado en el
 * celular, WhatsApp no guarda "archivado" a secas sino "archivado hasta tal mensaje": si
 * después escribe la otra persona, el chat vuelve a la bandeja. Baileys recibe ese
 * mensaje de corte pero no lo pasa en el evento: solo aparece en su registro interno ("processing
 * sync action"). El logger la captura acá, antes de que llegue el evento del chat.
 */
const rangoArchivado = new Map() // id del chat (como lo manda WhatsApp) → ids de los mensajes de corte

const NIVELES = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60, silent: Infinity }
const logger = pino({
  // trace para ver las acciones de sincronización; lo que se imprime sigue siendo BAILEYS_LOG.
  level: 'trace',
  hooks: {
    logMethod(args, metodo, nivel) {
      const accion = args[1] === 'processing sync action' ? args[0]?.syncAction : null
      const rango = accion?.syncAction?.value?.archiveChatAction?.messageRange
      const id = accion?.index?.[1]
      if (id && rango) rangoArchivado.set(id, (rango.messages || []).map((m) => m?.key?.id).filter(Boolean))
      if (nivel >= (NIVELES[BAILEYS_LOG] ?? Infinity)) metodo.apply(this, args)
    },
  },
})

let sock = null
let conexion = 'iniciando' // iniciando | conectando | qr | conectado | desconectado
let qrDataUrl = null
let yo = null
// Último intento de vincular un número que no es el de la concesionaria: { telefono, ts }.
let rechazo = null
let intentos = 0
let reconectarTimer = null
let detenido = false

const enviados = new Map() // id → contenido, para reintentos que pide WhatsApp (getMessage)
const mediaPropia = new Map() // id → buffer de archivos enviados desde el panel (evita volver a descargarlos)
const descargando = new Set()
const pushNames = new Map()
let sincronizando = false
let authActual = null

// Cuántas veces se intenta un archivo antes de darlo por perdido. Sin tope, la cola
// reintenta para siempre y le pega a WhatsApp sin conseguir nada.
const MAX_FALLOS_MEDIA = 2
const ESTADOS = { 0: 'error', 1: 'pendiente', 2: 'enviado', 3: 'entregado', 4: 'leido', 5: 'reproducido' }
const ORDEN = ['pendiente', 'enviado', 'entregado', 'leido', 'reproducido']
const ahora = () => Math.floor(Date.now() / 1000)

configurarFotos(() => (conexion === 'conectado' ? sock : null))

/* ---------------- Conexión ---------------- */

/** Cualquier usuario puede escanear el QR. Con WHATSAPP_NUMERO fijado, otro número se rechaza. */
export const estadoConexion = () => ({
  conexion,
  qr: qrDataUrl,
  numeroLinea: numeroLinea() ? `+${numeroLinea()}` : null,
  rechazo,
  yo,
  intentos,
})

const emitirEstado = () => emitir('estado', estadoConexion())

function setConexion(nuevo) {
  conexion = nuevo
  if (nuevo !== 'qr') qrDataUrl = null
  emitirEstado()
}

// Argentina: el mismo celular puede figurar como 54… o 549…; se comparan los últimos 10 dígitos.
const mismoNumero = (a, b) => String(a).replace(/\D/g, '').slice(-10) === String(b).replace(/\D/g, '').slice(-10)

/** La línea `telefono` no es la de la concesionaria: se desvincula y se vuelve a mostrar el QR. */
async function rechazarLinea(s, telefono, motivo) {
  log('error', motivo, `${telefono} · se desvinculó solo`)
  rechazo = { telefono, ts: Date.now() }
  // Primero se suelta el socket: así ningún evento de esa cuenta llega a guardarse.
  sock = null
  await s.logout().catch(() => {})
  borrarSesion()
  setMeta({ chatsSincronizados: null })
  yo = null
  setConexion('conectando')
  programar(1000)
}

/**
 * Vigila los .env: si cambia WHATSAPP_NUMERO se toma en el momento, sin reiniciar. Si la
 * línea conectada ya no es la configurada, se desvincula.
 */
let numeroVigilado = null
function vigilarNumero() {
  if (numeroVigilado !== null) return
  numeroVigilado = numeroLinea()
  for (const archivo of ARCHIVOS_ENV) {
    fs.watchFile(archivo, { interval: 2000 }, () => {
      const nuevo = numeroLinea()
      if (nuevo === numeroVigilado) return
      numeroVigilado = nuevo
      log(
        'info',
        nuevo ? 'Cambió el número de la concesionaria' : 'Se sacó el número de la concesionaria',
        nuevo ? `+${nuevo}` : 'Se acepta cualquier número',
      )
      emitirEstado()
      if (nuevo && sock && conexion === 'conectado' && yo && !mismoNumero(yo.telefono, nuevo)) {
        sinUsuario(() => rechazarLinea(sock, yo.telefono || yo.id, 'La línea conectada no es el número de la concesionaria'))
      }
    }).unref()
  }
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

/** Arranca (o reinicia) la conexión. Nunca queda atada al empleado que la pidió. */
export function iniciar() {
  vigilarNumero()
  return sinUsuario(() => iniciarConexion())
}

async function iniciarConexion() {
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
  // upsert: chats nuevos para la sesión; un grupo ahí listado entra a la bandeja.
  s.ev.on('chats.upsert', seguro('chats', (cs) => procesarChats(cs, { crearGrupos: true })))
  s.ev.on('chats.update', seguro('chats', (cs) => procesarChats(cs)))
  s.ev.on('presence.update', seguro('presencia', procesarPresencia))
  s.ev.on('contacts.upsert', seguro('contactos', (cs) => cs.forEach(guardarContacto)))
  s.ev.on('contacts.update', seguro('contactos', (cs) => cs.forEach(guardarContacto)))
  s.ev.on('lid-mapping.update', seguro('identificadores', registrarMapeo))
  // upsert: grupos que WhatsApp informa como nuevos → entran a la bandeja en el acto.
  s.ev.on('groups.upsert', seguro('grupos', (gs) => procesarGrupos(gs, { crear: true })))
  // update: cambios sueltos (asunto, descripción) sobre grupos que ya están.
  s.ev.on('groups.update', seguro('grupos', (gs) => procesarGrupos(gs)))
}

async function alActualizarConexion(s, { connection, lastDisconnect, qr }) {
  if (qr) {
    qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 8 })
    if (conexion !== 'qr') log('info', 'Código QR listo para escanear')
    conexion = 'qr'
    emitirEstado()
  }

  if (connection === 'open') {
    intentos = 0
    const id = jidNormalizedUser(s.user?.id)
    const numero = numeroLinea()
    if (numero && !mismoNumero(telefonoDe(id), numero)) {
      // Escanearon el QR con otro celular (o la sesión guardada es de otro número).
      return rechazarLinea(s, telefonoDe(id) || id, 'Se vinculó un número que no es el de la concesionaria')
    }
    rechazo = null
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
    // Los grupos se traen enseguida: son chats como cualquier otro y tienen que estar en
    // la bandeja desde el arranque, sin esperar a que alguien escriba.
    traerGrupos(s, 3000)
    // Las fotos van después, cuando ya se calmó la sincronización inicial.
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

// Estados, canales, Meta AI y la cuenta de avisos del sistema no son conversaciones.
// Los grupos sí entran: son parte del día a día de la concesionaria.
function ignorar(jid) {
  return !jid || jid === '0@s.whatsapp.net' || isJidBroadcast(jid) || isJidNewsletter(jid) || isJidMetaAI(jid)
}

/**
 * Registra el par LID↔teléfono que ya viene en la clave del mensaje. Es gratis (no
 * consulta nada) y sirve incluso para mensajes que después se descartan.
 */
function registrarLidDeKey(key) {
  // En un grupo el par viaja en el participante, no en el chat.
  const principal = isJidGroup(key?.remoteJid) ? key?.participant : key?.remoteJid
  const alterno = isJidGroup(key?.remoteJid) ? key?.participantAlt : key?.remoteJidAlt
  if (!principal || !alterno) return
  if (isPnUser(principal) && isLidUser(alterno)) registrarLid(jidNormalizedUser(alterno), jidNormalizedUser(principal))
  else if (isLidUser(principal) && isPnUser(alterno)) registrarLid(jidNormalizedUser(principal), jidNormalizedUser(alterno))
}

/** Devuelve el JID con teléfono cuando se conoce; si no, el LID. En un grupo, el grupo. */
async function jidDelChat(key) {
  const principal = key.remoteJid
  const alterno = key.remoteJidAlt
  if (isJidGroup(principal)) return jidNormalizedUser(principal)
  registrarLidDeKey(key)
  if (isPnUser(principal)) {
    return jidNormalizedUser(principal)
  }
  if (isLidUser(principal)) {
    const lid = jidNormalizedUser(principal)
    if (alterno && isPnUser(alterno)) return jidNormalizedUser(alterno)
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

/**
 * Resuelve quién escribió dentro de un grupo. WhatsApp lo manda en `participant`, a
 * veces con LID; si se conoce el teléfono se usa ese, para que sea el mismo contacto
 * que en su chat individual.
 */
async function autorDelMensaje(m) {
  const crudo = m.key?.participant || m.participant
  if (!crudo) return null
  const alterno = m.key?.participantAlt
  if (alterno && isPnUser(alterno)) return jidNormalizedUser(alterno)
  const jid = jidNormalizedUser(crudo)
  if (isPnUser(jid)) return jid
  if (isLidUser(jid)) {
    let pn = pnDeLid(jid)
    if (!pn) {
      try {
        const r = await sock?.signalRepository?.lidMapping?.getPNForLID(crudo)
        if (r) {
          pn = jidNormalizedUser(r)
          registrarLid(jid, pn)
        }
      } catch {}
    }
    return pn || jid
  }
  return jid
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
  const grupo = esGrupo(chatId)
  const ts = toNumber(m.messageTimestamp) || ahora()
  // En un grupo el pushName es del autor: no puede pasar a ser el nombre del chat.
  if (!deMi && !grupo) actualizarPushName(chatId, m.pushName)

  const mensaje = { id: key.id, deMi, ts, ...datos, origen }
  if (deMi) mensaje.estado = ESTADOS[m.status] || 'enviado'

  // En un grupo hace falta saber quién habló, para dibujarlo arriba de cada burbuja y
  // porque WhatsApp exige el participante al archivar o marcar como leído.
  if (grupo && !deMi) {
    const autor = await autorDelMensaje(m)
    if (autor) {
      mensaje.autor = autor
      if (m.pushName) setContacto(autor, { notify: m.pushName })
      mensaje.autorNombre = nombreDe(autor)
    } else if (m.pushName) {
      mensaje.autorNombre = m.pushName
    }
  }

  if (datos.media) {
    // Se guarda el mensaje crudo para poder descargar el archivo más tarde.
    mensaje.raw = JSON.stringify({ key: m.key, message: m.message, messageTimestamp: m.messageTimestamp }, BufferJSON.replacer)
    const propio = mediaPropia.get(key.id)
    if (propio) {
      const archivo = `${key.id}.${extensionDe(datos.media.mime, datos.media.nombre)}`
      mediaPropia.delete(key.id)
      try {
        await guardarMedia(chatId, archivo, propio, datos.media.mime)
        mensaje.media = { ...datos.media, archivo, tamano: propio.length, estado: 'ok' }
      } catch (err) {
        // Queda como pendiente: se puede volver a bajar de WhatsApp con el mensaje crudo.
        log('aviso', 'No se pudo guardar un archivo enviado', err.message)
      }
    }
  }

  const { nuevo, mensaje: guardado } = agregarMensaje(chatId, mensaje)
  if (!nuevo) return
  if (grupo) pedirNombreGrupo(chatId)
  if (tipoUpsert === 'notify') pedirFotos([chatId])
  if (tipoUpsert === 'notify' && !deMi) {
    sumarNoLeido(chatId)
    // Igual que el celular: si la cuenta tiene activado "desarchivar al recibir mensajes", el chat vuelve a la lista.
    const creds = sock?.authState?.creds || authActual?.creds
    if (estaArchivado(chatId) && creds?.accountSettings?.unarchiveChats) setArchivado(chatId, false)
  }

  if (guardado.media && guardado.media.estado !== 'ok' && config().descargarMedia) {
    // Lo que acaba de llegar se baja en el momento; lo del historial va a la cola, para
    // no pedirle cientos de archivos a WhatsApp de golpe.
    if (ahora() - ts < MEDIA_RECIENTE_SEG) await descargarMedia(chatId, guardado)
    else encolarMedia(chatId, guardado.id)
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
  // WhatsApp manda la lista de chats además de los mensajes, y no siempre trae mensajes
  // de todos. Un grupo listado entra igual a la bandeja: si no, quedaría invisible hasta
  // que alguien escriba, y WhatsApp no vuelve a mandar el historial.
  let grupos = 0
  for (const ch of chats) {
    if (ignorar(ch.id)) continue
    const id = ch.pnJid ? jidNormalizedUser(ch.pnJid) : await jidDelChat({ remoteJid: ch.id })
    if (ignorar(id)) continue
    if (!existeChat(id) && isJidGroup(id)) {
      upsertChat(id, { ultimoTs: toNumber(ch.conversationTimestamp) || 0 })
      grupos++
    }
    if (ch.name) setGrupoNombre(id, ch.name)
    if (ch.unreadCount && existeChat(id)) upsertChat(id, { noLeidos: ch.unreadCount })
  }
  await procesarChats(chats)
  if (individuales || grupos) {
    const detalle = [`${individuales} mensajes`, grupos ? `${grupos} grupos nuevos` : null].filter(Boolean).join(' · ')
    log('info', 'Historial recibido de WhatsApp', detalle)
  }
}

/* ---------------- Grupos ---------------- */

const nombresPedidos = new Set()

/**
 * Guarda el asunto de un grupo (WhatsApp lo llama `subject`). Con `crear`, el grupo
 * entra a la bandeja aunque todavía no tenga mensajes guardados: es lo que hace que los
 * grupos aparezcan sin esperar a que alguien escriba. Se ordena por su fecha de creación,
 * así queda abajo de las conversaciones con actividad real.
 */
function guardarGrupo(g, { crear = false } = {}) {
  const jid = g?.id
  if (!jid || !isJidGroup(jid) || !g.subject) return false
  if (!existeChat(jid)) {
    if (!crear) return false
    upsertChat(jid, { ultimoTs: toNumber(g.creation) || 0 })
    setGrupoNombre(jid, g.subject)
    return true
  }
  return setGrupoNombre(jid, g.subject)
}

const procesarGrupos = (grupos, opts) => [].concat(grupos || []).forEach((g) => guardarGrupo(g, opts))

/** Nombre de un grupo puntual, la primera vez que llega un mensaje suyo. */
async function pedirNombreGrupo(jid) {
  if (!sock || conexion !== 'conectado' || nombresPedidos.has(jid)) return
  nombresPedidos.add(jid)
  try {
    guardarGrupo(await sock.groupMetadata(jid))
  } catch {
    // Grupo del que ya no se forma parte: se queda sin asunto y se muestra como "Grupo".
  }
}

/**
 * Trae todos los grupos en los que está la línea y los mete en la bandeja. Es la forma
 * de verlos sin esperar a que llegue un mensaje: WhatsApp no reenvía el historial viejo
 * una vez que la sesión ya sincronizó.
 */
export async function sincronizarGrupos() {
  asegurarConectado()
  const todos = await sock.groupFetchAllParticipating()
  const lista = Object.values(todos || {})
  let nuevos = 0
  for (const g of lista) {
    const habia = existeChat(g?.id)
    if (guardarGrupo(g, { crear: true }) && !habia) nuevos++
  }
  log('ok', 'Grupos sincronizados', `${lista.length} grupos · ${nuevos} nuevos en la bandeja`)
  pedirFotos(lista.map((g) => g.id).filter(Boolean))
  // Archivado, fijado y silenciado viven en el app-state, que se baja aparte. Si entraron
  // grupos nuevos, sus marcas nunca se guardaron: hay que volver a pedirlas.
  if (nuevos) {
    setMeta({ chatsSincronizados: null })
    sincronizarChats().catch((err) => log('aviso', 'No se pudieron traer las marcas de los grupos', err.message))
  }
  return { grupos: lista.length, nuevos }
}

/** Pide los grupos con un reintento: al conectar, la consulta puede llegar demasiado temprano. */
function traerGrupos(s, espera, intento = 1) {
  setTimeout(async () => {
    if (s !== sock || conexion !== 'conectado') return
    try {
      await sincronizarGrupos()
    } catch (err) {
      if (intento < 3) return traerGrupos(s, 15000, intento + 1)
      log('aviso', 'No se pudieron traer los grupos', err.message)
    }
  }, espera).unref()
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

/**
 * Si un archivado sigue en pie, con la misma regla que el celular: con "desarchivar al
 * recibir mensajes" activado, un chat archivado vuelve a la bandeja si la otra persona
 * escribió después de que se archivó.
 */
const cuentaArchivo = { siguen: 0, vuelven: 0, sinCorte: 0 } // para el registro de cada sincronización

function archivadoVigente(ch, id) {
  if (!ch.archived) return false
  const creds = sock?.authState?.creds || authActual?.creds
  const corte = rangoArchivado.get(ch.id)
  rangoArchivado.delete(ch.id)
  if (!creds?.accountSettings?.unarchiveChats) return true
  const despues = corte?.length ? recibioDespuesDe(id, corte) : null
  // Sin el mensaje de corte guardado no se puede saber: vale lo que dice WhatsApp.
  if (despues === null) {
    cuentaArchivo.sinCorte++
    return true
  }
  cuentaArchivo[despues ? 'vuelven' : 'siguen']++
  return !despues
}

async function procesarChats(chats, { crearGrupos = false } = {}) {
  for (const ch of chats || []) {
    if (!ch?.id) continue
    const cambiaArchivo = typeof ch.archived === 'boolean'
    const cambiaFijado = 'pinned' in ch
    const cambiaSilencio = 'muteEndTime' in ch
    const cambiaNombre = !!ch.name
    const grupoNuevo = crearGrupos && isJidGroup(ch.id) && !existeChat(ch.id)
    if (!cambiaArchivo && !cambiaFijado && !cambiaSilencio && !cambiaNombre && !grupoNuevo) continue
    if (ch.pnJid && ch.lidJid) registrarLid(jidNormalizedUser(ch.lidJid), jidNormalizedUser(ch.pnJid))
    if (ignorar(ch.id)) continue
    const id = ch.pnJid ? jidNormalizedUser(ch.pnJid) : await jidDelChat({ remoteJid: ch.id })
    if (ignorar(id)) continue
    // Un grupo que WhatsApp lista como nuevo entra a la bandeja sin esperar un mensaje.
    if (crearGrupos && isJidGroup(id) && !existeChat(id)) {
      upsertChat(id, { ultimoTs: toNumber(ch.conversationTimestamp) || 0 })
    }
    if (cambiaNombre) setGrupoNombre(id, ch.name)
    if (cambiaArchivo) setArchivado(id, archivadoVigente(ch, id))
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
    log('info', 'Archivados revisados', `${cuentaArchivo.siguen} siguen · ${cuentaArchivo.vuelven} volvieron a la bandeja por mensajes nuevos · ${cuentaArchivo.sinCorte} sin el mensaje de corte guardado`)
    Object.assign(cuentaArchivo, { siguen: 0, vuelven: 0, sinCorte: 0 })
    const r = contarMarcas()
    log('ok', 'Chats sincronizados', `${r.archivados} archivados · ${r.fijados} fijados`)
    return r
  } finally {
    sincronizando = false
  }
}

/* ---------------- Ficha del chat ---------------- */

// Cuántas fotos de integrantes se piden por vez al abrir la ficha de un grupo.
const MAX_FOTOS_INTEGRANTES = 60

// Lo que WhatsApp muestra en "Archivos, enlaces y documentos".
const GRUPOS_MEDIA = {
  fotos: ['imagen'],
  videos: ['video', 'gif'],
  audios: ['audio', 'nota_voz'],
  documentos: ['documento'],
}
const RE_ENLACE = /https?:\/\/[^\s]+|www\.[^\s]+/gi

/** Resuelve el nombre de un participante, que puede venir identificado con LID. */
function fichaParticipante(p, yoJid) {
  const crudo = p?.id || p?.jid
  if (!crudo) return null
  const alterno = p.phoneNumber || p.pn
  let jid = jidNormalizedUser(crudo)
  if (isLidUser(jid)) jid = (alterno && jidNormalizedUser(alterno)) || pnDeLid(jid) || jid
  return {
    id: jid,
    nombre: jid === yoJid ? 'Vos' : nombreDe(jid),
    telefono: telefonoDe(jid),
    admin: p.admin === 'superadmin' ? 'creador' : p.admin ? 'admin' : null,
    foto: infoFoto(jid)?.tiene ? infoFoto(jid).ts : null,
  }
}

/**
 * Ficha del chat: lo mismo que muestra WhatsApp al tocar el encabezado. Los archivos
 * salen de lo ya guardado; los integrantes se le piden a WhatsApp en el momento, porque
 * cambian y no se guardan en disco.
 */
export async function fichaChat(chatId) {
  const chat = buscarChat(chatId)
  const mensajes = chat ? listarMensajes(chatId) : []

  const media = { fotos: [], videos: [], audios: [], documentos: [] }
  const enlaces = []
  for (const m of mensajes) {
    if (m.eliminado) continue
    const cat = m.media && Object.keys(GRUPOS_MEDIA).find((k) => GRUPOS_MEDIA[k].includes(m.tipo))
    if (cat) {
      media[cat].push({
        id: m.id,
        tipo: m.tipo,
        ts: m.ts,
        nombre: m.media.nombre || null,
        tamano: m.media.tamano || null,
        segundos: m.media.segundos || null,
        descargado: m.media.estado === 'ok',
        // Para dibujar el archivo como se ve en el chat: quién lo mandó y qué escribió.
        deMi: !!m.deMi,
        autorNombre: m.autorNombre || null,
        autorTelefono: m.autor ? telefonoDe(m.autor) : null,
        texto: m.texto || null,
        perdido: (m.media.fallos || 0) >= MAX_FALLOS_MEDIA,
      })
    }
    for (const url of String(m.texto || '').match(RE_ENLACE) || []) {
      enlaces.push({
        id: m.id,
        ts: m.ts,
        url,
        texto: m.texto || null,
        deMi: !!m.deMi,
        autorNombre: m.autorNombre || null,
        autorTelefono: m.autor ? telefonoDe(m.autor) : null,
      })
    }
  }
  // Lo más nuevo primero, como en WhatsApp.
  for (const k of Object.keys(media)) media[k].reverse()
  enlaces.reverse()

  const ficha = {
    id: chatId,
    ...vistaChat(chat || { id: chatId, noLeidos: 0, ultimoTs: 0, ultimo: null }),
    sinChat: !chat,
    mensajes: mensajes.length,
    media,
    enlaces: enlaces.slice(0, 100),
    totales: {
      fotos: media.fotos.length,
      videos: media.videos.length,
      audios: media.audios.length,
      documentos: media.documentos.length,
      enlaces: enlaces.length,
    },
  }

  if (!esGrupo(chatId)) return ficha

  try {
    asegurarConectado()
    const g = await sock.groupMetadata(chatId)
    const yoJid = yo?.id
    const participantes = (g.participants || []).map((p) => fichaParticipante(p, yoJid)).filter(Boolean)
    ficha.grupo = {
      descripcion: g.desc || null,
      creacion: toNumber(g.creation) || null,
      participantes,
    }
    // Las fotos de los integrantes se piden en segundo plano, de a una y con pausa (fotos.js).
    // En un grupo de mil personas pedirlas todas haría que WhatsApp corte, así que se
    // encaran las primeras y el resto se completa cada vez que se abre la ficha.
    pedirFotos(participantes.slice(0, MAX_FOTOS_INTEGRANTES).map((p) => p.id))
  } catch (err) {
    // Grupo del que ya no se forma parte, o sin conexión: se muestra lo guardado igual.
    ficha.grupo = { error: err.message, participantes: [] }
  }
  return ficha
}

/**
 * Reenvía mensajes a otros chats, como el "Reenviar" de WhatsApp. Necesita el mensaje
 * original completo: para los que tienen archivo está en `raw`, y para el texto se
 * reconstruye con lo guardado.
 */
export async function reenviarMensajes(origen, ids, destinos) {
  asegurarConectado()
  const lista = [].concat(ids || []).filter(Boolean)
  const aDonde = [].concat(destinos || []).filter(Boolean)
  if (!lista.length) throw new Error('No elegiste ningún mensaje')
  if (!aDonde.length) throw new Error('No elegiste a dónde reenviarlo')
  if (lista.length > 30) throw new Error('Se pueden reenviar hasta 30 mensajes por vez')

  let enviados = 0
  const fallados = []
  for (const destino of aDonde) {
    // En orden, para que lleguen como se ven en la conversación.
    for (const id of lista) {
      const m = buscarMensaje(origen, id)
      if (!m || m.eliminado) {
        fallados.push(id)
        continue
      }
      const wa = m.raw
        ? JSON.parse(m.raw, BufferJSON.reviver)
        : { key: claveMensaje(origen, m), message: { conversation: m.texto || '' } }
      try {
        const r = await sock.sendMessage(destino, { forward: wa })
        if (r && !buscarMensaje(destino, r.key.id)) await procesarEntrante(r, 'append')
        if (r) firmarEnviado(destino, r.key.id)
        enviados++
      } catch (err) {
        fallados.push(id)
        log('aviso', 'No se pudo reenviar un mensaje', `${nombreDe(destino)} · ${err.message}`)
      }
    }
  }
  if (!enviados) throw new Error('No se pudo reenviar ningún mensaje')
  return { enviados, chats: aDonde.length, fallados: fallados.length }
}

/** Sale de un grupo. El chat y su historial quedan guardados acá. */
export async function salirDelGrupo(chatId) {
  asegurarConectado()
  if (!esGrupo(chatId)) throw new Error('Eso no es un grupo')
  await sock.groupLeave(chatId)
  log('aviso', 'Se salió de un grupo', `${nombreDe(chatId)} · la conversación queda guardada`)
  return { ok: true }
}

/* ---------------- Marcas del chat (archivar, fijar, silenciar) ---------------- */

// Silenciar por un rato o para siempre, como ofrece WhatsApp.
export const DURACIONES_SILENCIO = { '8h': 8 * 3600e3, '1s': 7 * 24 * 3600e3, siempre: null }

/** WhatsApp pide el último mensaje del chat para saber a qué altura aplicar el cambio. */
function ultimosMensajes(chatId) {
  const m = listarMensajes(chatId).at(-1)
  return m ? [{ key: claveMensaje(chatId, m), messageTimestamp: m.ts }] : []
}

/**
 * Cambia una marca del chat y la propaga al celular con chatModify, que es lo que hace
 * que archivar acá también archive allá.
 *
 * La marca local se aplica en el acto (el panel responde al toque) y se vuelve atrás si
 * WhatsApp rechaza el pedido. El evento chats.update que llega después confirma lo mismo.
 */
export async function cambiarMarca(chatId, accion, valor) {
  asegurarConectado()
  if (!existeChat(chatId)) throw Object.assign(new Error('El chat no existe'), { status: 404 })

  const previo = { archivado: estaArchivado(chatId), fijado: fijadoDe(chatId), silenciado: silenciadoDe(chatId) }
  let mod
  let volverAtras

  if (accion === 'archivar') {
    mod = { archive: !!valor, lastMessages: ultimosMensajes(chatId) }
    setArchivado(chatId, !!valor)
    volverAtras = () => setArchivado(chatId, previo.archivado)
  } else if (accion === 'fijar') {
    mod = { pin: !!valor }
    setFijado(chatId, valor ? ahora() : null)
    volverAtras = () => setFijado(chatId, previo.fijado)
  } else if (accion === 'silenciar') {
    // `valor` es una clave de DURACIONES_SILENCIO, o null para reactivar los avisos.
    if (valor !== null && !(valor in DURACIONES_SILENCIO)) throw new Error('Duración de silencio desconocida')
    const dur = valor === null ? null : DURACIONES_SILENCIO[valor]
    // "Siempre" es un vencimiento tan lejano que no llega nunca: WhatsApp no tiene un valor propio.
    const hasta = valor === null ? null : dur === null ? Date.now() + 100 * 365 * 24 * 3600e3 : Date.now() + dur
    mod = { mute: hasta }
    setSilenciado(chatId, hasta)
    volverAtras = () => setSilenciado(chatId, previo.silenciado)
  } else if (accion === 'no-leido') {
    mod = { markRead: false, lastMessages: ultimosMensajes(chatId) }
    sumarNoLeido(chatId)
    volverAtras = () => marcarLeido(chatId)
  } else {
    throw new Error('Acción desconocida')
  }

  try {
    await sock.chatModify(mod, chatId)
  } catch (err) {
    volverAtras()
    throw new Error(`WhatsApp no aceptó el cambio: ${err.message}`, { cause: err })
  }
  return vistaChat(buscarChat(chatId))
}

/* ---------------- Multimedia ---------------- */

// Enlace vencido o archivo borrado de los servidores de WhatsApp: hay que pedirle al celular que lo reenvíe.
// (Baileys rc14 no lo hace solo: busca error.status, pero su propio error trae output.statusCode.)
const REQUIERE_REENVIO = [403, 404, 410]
const REENVIO_TIMEOUT_MS = 30000

/**
 * ¿Vale la pena pedirle al celular que reenvíe el archivo? Pasa con los enlaces vencidos
 * (403/404/410) y también cuando el archivo baja pero no se puede descifrar: la clave
 * guardada quedó vieja y el celular puede dar uno nuevo.
 */
function sePuedePedirReenvio(err) {
  const codigo = err?.output?.statusCode ?? err?.status
  if (REQUIERE_REENVIO.includes(codigo)) return true
  const texto = err?.message || String(err)
  return /unable to authenticate|unsupported state|bad decrypt|Failed to fetch stream/i.test(texto)
}

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
      if (!sePuedePedirReenvio(err)) throw err
      if (!sock || conexion !== 'conectado') {
        throw new Error('El enlace venció y WhatsApp no está conectado para pedir el reenvío.', { cause: err })
      }
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
    await guardarMedia(chatId, archivo, buffer, m.media.mime)
    return actualizarMensaje(chatId, m.id, { media: { ...m.media, archivo, tamano: buffer.length, estado: 'ok', error: null, fallos: 0 } })
  } catch (err) {
    const error = mensajeDeError(err, huboReenvio)
    const actual = buscarMensaje(chatId, m.id)
    if (actual?.media?.estado === 'error' && actual.media.error === error) {
      emitir('mensaje', { chatId, mensaje: vistaMensaje(actual) })
      return actual
    }
    const fallos = (actual?.media?.fallos || m.media?.fallos || 0) + 1
    if (fallos === 1 || fallos >= MAX_FALLOS_MEDIA) {
      log('aviso', 'No se pudo descargar un archivo', `${nombreDe(chatId)} · ${error}`)
    }
    return actualizarMensaje(chatId, m.id, { media: { ...m.media, estado: 'error', error, fallos } })
  } finally {
    descargando.delete(m.id)
  }
}

/* ---------------- Cola de descargas ---------------- */

const colaMedia = []
const enColaMedia = new Set()
let bajando = false
// Una descarga por vez y con pausa: WhatsApp corta si se le piden muchos archivos seguidos.
const PAUSA_MEDIA_MS = 700

/** Un archivo que ya falló varias veces no vuelve a la cola: no se recupera insistiendo. */
const seDaPorPerdido = (m) => (m?.media?.fallos || 0) >= MAX_FALLOS_MEDIA

/** Agenda la descarga de un archivo sin bloquear a quien lo pide. */
export function encolarMedia(chatId, id, { forzar = false } = {}) {
  const llave = `${chatId}|${id}`
  if (enColaMedia.has(llave)) return false
  if (!forzar && seDaPorPerdido(buscarMensaje(chatId, id))) return false
  enColaMedia.add(llave)
  colaMedia.push({ chatId, id })
  arrancarCola()
  return true
}

function arrancarCola() {
  sinUsuario(() => trabajarCola())
}

async function trabajarCola() {
  if (bajando) return
  bajando = true
  try {
    while (colaMedia.length) {
      if (!sock || conexion !== 'conectado' || !config().descargarMedia) break
      const { chatId, id } = colaMedia.shift()
      enColaMedia.delete(`${chatId}|${id}`)
      const m = buscarMensaje(chatId, id)
      if (m?.media && m.media.estado !== 'ok' && m.raw) {
        try {
          await descargarMedia(chatId, m)
        } catch {
          // descargarMedia ya deja el error anotado en el mensaje.
        }
      }
      await new Promise((r) => setTimeout(r, PAUSA_MEDIA_MS))
    }
  } finally {
    bajando = false
  }
}

export const pendientesDeDescarga = () => colaMedia.length

/** Encola todo lo que falta de un chat. Lo usa el botón "Descargar todo". */
/**
 * Encola todo lo que falta de un chat. Los que ya fallaron el máximo de veces se saltean,
 * salvo que se pida `reintentar`: es el botón de "probar de nuevo" del usuario.
 */
export function descargarTodo(chatId, { reintentar = false } = {}) {
  asegurarConectado()
  let n = 0
  let perdidos = 0
  for (const m of listarMensajes(chatId)) {
    if (!m.media || m.media.estado === 'ok' || !m.raw) continue
    if (!reintentar && seDaPorPerdido(m)) {
      perdidos++
      continue
    }
    if (reintentar) actualizarMensaje(chatId, m.id, { media: { ...m.media, fallos: 0 } })
    if (encolarMedia(chatId, m.id, { forzar: reintentar })) n++
  }
  if (n) log('info', 'Descargando archivos del chat', `${nombreDe(chatId)} · ${n} archivos en cola`)
  return { encolados: n, enCola: colaMedia.length, perdidos }
}

/** Dónde está el archivo ya descargado. No descarga nada: eso lo pide el usuario con descargarAhora. */
export function obtenerMedia(chatId, id) {
  const m = buscarMensaje(chatId, id)
  if (!m?.media?.archivo || !existeMedia(chatId, m.media.archivo)) {
    throw Object.assign(new Error('El archivo todavía no está descargado'), { status: 404 })
  }
  return { clave: claveMedia(chatId, m.media.archivo), mime: m.media.mime, nombre: m.media.nombre }
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
    if (enviado) firmarEnviado(chatId, enviado.key.id)
    return enviado?.key?.id
  } finally {
    setTimeout(() => mediaPropia.delete(messageId), 60000)
  }
}

/** Clave de un mensaje guardado. En un grupo lleva además quién lo escribió. */
function claveMensaje(chatId, m) {
  const key = { remoteJid: chatId, id: m.id, fromMe: !!m.deMi }
  if (esGrupo(chatId) && m.autor) key.participant = m.autor
  return key
}

/**
 * Anota qué empleado mandó el mensaje. Lo guarda el evento de WhatsApp, que corre fuera
 * del pedido del empleado, así que la firma se pone acá, cuando el envío ya volvió.
 * Lo que se manda desde el celular queda sin firma.
 */
function firmarEnviado(chatId, id) {
  const u = usuarioActual()
  if (!u || !id || !buscarMensaje(chatId, id)) return
  actualizarMensaje(chatId, id, { enviadoPor: { id: u.id, nombre: u.nombre } })
}

/** Mensaje a citar, armado con lo guardado: Baileys necesita la clave y el contenido original. */
function mensajeCitado(chatId, id) {
  const m = id ? buscarMensaje(chatId, id) : null
  if (!m) return undefined
  const message = m.raw ? JSON.parse(m.raw, BufferJSON.reviver).message : { conversation: m.texto || '' }
  return { key: claveMensaje(chatId, m), message }
}

export function enviarTexto(chatId, texto, citadoId) {
  const limpio = String(texto || '').trim()
  if (!limpio) throw new Error('El mensaje está vacío')
  return enviar(chatId, { text: limpio }, undefined, mensajeCitado(chatId, citadoId))
}

/**
 * Elimina un mensaje para todos, como el "Eliminar para todos" del celular. El respaldo
 * conserva el original igual: WhatsApp avisa por messages.update y ahí se marca, no se borra.
 */
export async function eliminarMensaje(chatId, id) {
  asegurarConectado()
  const m = buscarMensaje(chatId, id)
  if (!m) throw Object.assign(new Error('El mensaje no existe'), { status: 404 })
  if (!m.deMi) throw new Error('Solo se pueden eliminar para todos los mensajes propios')
  if (m.eliminado) throw new Error('Ese mensaje ya estaba eliminado')
  await sock.sendMessage(chatId, { delete: claveMensaje(chatId, m) })
  // El aviso de WhatsApp puede tardar: se marca ya para que la pantalla responda.
  marcarEliminado(chatId, id, { fromMe: true })
  return vistaMensaje(buscarMensaje(chatId, id))
}

/** Destaca un mensaje (la estrella de WhatsApp). Se sincroniza con el celular. */
export async function destacarMensaje(chatId, id, destacar) {
  asegurarConectado()
  const m = buscarMensaje(chatId, id)
  if (!m) throw Object.assign(new Error('El mensaje no existe'), { status: 404 })
  await sock.chatModify({ star: { messages: [{ id: m.id, fromMe: !!m.deMi }], star: !!destacar } }, chatId)
  return vistaMensaje(actualizarMensaje(chatId, id, { destacado: !!destacar }))
}

/** Reacciona a un mensaje. Un emoji vacío quita la reacción. */
export async function enviarReaccion(chatId, id, emoji) {
  asegurarConectado()
  const m = buscarMensaje(chatId, id)
  if (!m) throw Object.assign(new Error('El mensaje no existe'), { status: 404 })
  const texto = emoji || ''
  await sock.sendMessage(chatId, { react: { text: texto, key: claveMensaje(chatId, m) } })
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
  if (recibidos.length) await sock.readMessages(recibidos.map((m) => claveMensaje(chatId, m)))
}
