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
import crypto from 'node:crypto'
import fs from 'node:fs'
import QRCode from 'qrcode'
import pino from 'pino'
import makeWASocket, {
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
import {
  ARCHIVOS_ENV,
  BAILEYS_LOG,
  CONSERVAR_EDICIONES,
  CONSERVAR_ELIMINADOS,
  MEDIA_MAX_BYTES,
  MEDIA_RECIENTE_SEG,
  VENTANA_DIAS,
  VERSION_WA,
  numeroEnArchivos,
  numeroLinea,
} from './config.js'
import { emitir, log } from './eventos.js'
import { alertar, resolver, vigilar } from './vigia.js'
import { mismoNumero } from './telefono.js'
import { extensionDe } from './tipos.js'
import { respaldarEnv, respaldarSesion, respaldoActivo } from './respaldo.js'
import { auditar } from './auditoria.js'
import { manejaLinea, sinUsuario, usuarioActual } from './auth.js'
import { aNotaDeVoz, formaDeOnda, miniatura } from './audio.js'
import { claveFoto, configurarFotos, pedirFotos, pedirFotosDeTodos, repararFotos } from './fotos.js'
import { borrar as borrarArchivo, guardar as guardarArchivo, leer as leerArchivo, listarArchivos, medirR2 } from './archivos.js'
import * as cuota from './cuota.js'
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
  quitarMensaje,
  borrarChatEntero,
  conFotoGuardada,
  quitarAnterioresA,
  recorrerMensajes,
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

// Cómo aparece el servidor en "Dispositivos vinculados" del celular de la línea.
const NOMBRE_DISPOSITIVO = 'Whatsapp Neifert'

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
let conexionDesde = Date.now() // desde cuándo está en ese estado (para la alerta de caída)
let qrDataUrl = null
let yo = null
// Último intento de vincular un número que no es el de la concesionaria: { telefono, ts }.
let rechazo = null
let intentos = 0
let reconectarTimer = null
let detenido = false

const enviados = new Map() // id → contenido, para reintentos que pide WhatsApp (getMessage)
const idsDelPanel = new Set() // ids de lo mandado desde el panel (lo demás propio salió del celular)
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
/** Lo anterior a este momento (segundos) está fuera de la ventana de días: no se guarda. */
const corteVentana = () => ahora() - VENTANA_DIAS * 86400

configurarFotos(() => (conexion === 'conectado' ? sock : null))

/* ---------------- Conexión ---------------- */

/**
 * Estado de la línea. El QR solo les llega a quienes manejan la línea (WHATSAPP_ROLES_LINEA):
 * con él se vincula un celular. Con WHATSAPP_NUMERO, además, otro número se rechaza.
 */
export const estadoConexion = (usuario = usuarioActual()) => ({
  conexion,
  desde: conexionDesde,
  qr: manejaLinea(usuario) ? qrDataUrl : null,
  puedeVincular: manejaLinea(usuario),
  numeroLinea: numeroLinea() ? `+${numeroLinea()}` : null,
  rechazo,
  yo,
  intentos,
})

const emitirEstado = () => emitir('estado', (usuario) => estadoConexion(usuario))

function setConexion(nuevo) {
  if (nuevo !== conexion) conexionDesde = Date.now()
  conexion = nuevo
  if (nuevo !== 'qr') qrDataUrl = null
  emitirEstado()
}

/** La línea `telefono` no es la de la concesionaria: se desvincula y se vuelve a mostrar el QR. */
async function rechazarLinea(s, telefono, motivo) {
  log('error', motivo, `${telefono} · se desvinculó solo`)
  auditar({ accion: 'rechazo_numero', resultado: 'denegado', detalle: { telefono, motivo } })
  rechazo = { telefono, ts: Date.now() }
  // Primero se suelta el socket: así ningún evento de esa cuenta llega a guardarse.
  sock = null
  // La baja puede tardar hasta un minuto si WhatsApp no contesta: se espera como mucho
  // 5 s y se corta igual, así enseguida hay un QR nuevo (y la app muestra el error).
  try {
    await Promise.race([s.logout().catch(() => {}), new Promise((r) => setTimeout(r, 5000))])
    try {
      s.end(undefined)
    } catch {}
    borrarSesion()
    setMeta({ chatsSincronizados: null })
  } finally {
    // Pase lo que pase al limpiar, siempre se arma un QR nuevo: si no, quedaba "cargando".
    yo = null
    setConexion('conectando')
    programar(1000)
  }
}

/**
 * Vigila los .env: si alguien cambia WHATSAPP_NUMERO con el servidor andando, avisa. Cada
 * número tiene sus propios datos, así que para pasar a otra línea hay que reiniciar (la app
 * de escritorio lo hace sola al cambiar el número).
 */
let numeroVigilado = null
function vigilarNumero() {
  if (numeroVigilado !== null) return
  numeroVigilado = numeroEnArchivos()
  for (const archivo of ARCHIVOS_ENV) {
    fs.watchFile(archivo, { interval: 2000 }, () => {
      const nuevo = numeroEnArchivos()
      if (nuevo === numeroVigilado) return
      numeroVigilado = nuevo
      log('aviso', 'Cambió WHATSAPP_NUMERO en el .env', `Ahora dice ${nuevo ? `+${nuevo}` : '(vacío)'}, pero el servidor sigue con la línea ${numeroLinea() ? `+${numeroLinea()}` : 'sin número'}. Reinicialo para pasar a la otra línea (cada número tiene sus propios datos).`)
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
  arrancarVigia()
  return sinUsuario(() => iniciarConexion())
}

/**
 * Versión del protocolo de WhatsApp Web, fija: WA_VERSION si está definida; si no, la
 * última con la que se conectó bien (queda guardada), y si no hay ninguna, la que trae
 * Baileys. Solo se consulta la vigente cuando WhatsApp rechaza la que se usa (405).
 */
let actualizarVersion = false
async function versionWa() {
  if (VERSION_WA) return VERSION_WA
  if (actualizarVersion) {
    actualizarVersion = false
    try {
      const { version } = await fetchLatestBaileysVersion()
      setMeta({ versionWa: version })
      log('aviso', 'Se actualizó la versión de WhatsApp Web', version.join('.'))
      return version
    } catch (err) {
      log('aviso', 'No se pudo consultar la versión vigente de WhatsApp Web', err.message)
    }
  }
  return meta().versionWa || undefined
}

/* ---------------- Señales del celular y vigía ---------------- */

/**
 * WhatsApp desvincula los dispositivos si el celular pasa 14 días sin conectarse. Cuenta
 * como señal todo lo que solo puede venir del celular: un mensaje mandado desde él, o que
 * responda un pedido de reenvío de archivos.
 */
function senalDelCelular() {
  const ahoraMs = Date.now()
  // Se guarda como mucho una vez por hora: no hace falta más precisión.
  if (ahoraMs - (meta().ultimaSenalCelular || 0) > 3600e3) setMeta({ ultimaSenalCelular: ahoraMs })
  sinRespuestaCelular = 0
  resolver('celular-sin-respuesta')
}

let sinRespuestaCelular = 0
/** El celular no respondió un pedido de reenvío: de a varios seguidos, puede estar sin internet. */
function celularNoResponde() {
  if (++sinRespuestaCelular < 3) return
  alertar(
    'El celular de la concesionaria no responde',
    'No contestó varios pedidos seguidos para volver a subir archivos. Revisá que tenga internet y WhatsApp abierto.',
    { clave: 'celular-sin-respuesta' },
  )
}

/* ---------------- Respaldo de la sesión ---------------- */

let respaldoTimer = null
/**
 * Respalda la sesión cifrada en R2 (ver respaldo.js). Los cambios de la llave vienen de a
 * muchos seguidos: se agrupan y se respalda una vez, `ms` después del último.
 */
function programarRespaldo(ms = 120_000) {
  if (!respaldoActivo()) return
  clearTimeout(respaldoTimer)
  respaldoTimer = setTimeout(() => sinUsuario(() => respaldarAhora()), ms)
  respaldoTimer.unref?.()
}

async function respaldarAhora() {
  try {
    const r = await respaldarSesion(AUTH_DIR)
    if (r) setMeta({ respaldo: { ts: Date.now(), bytes: r.bytes, archivos: r.archivos, error: null } })
  } catch (err) {
    setMeta({ respaldo: { ...(meta().respaldo || {}), error: err.message, errorTs: Date.now() } })
    alertar('No se pudo respaldar la sesión de WhatsApp', `${err.message}. Si la PC se rompe, habría que volver a escanear el QR.`, { clave: 'respaldo', nivel: 'aviso' })
    return
  }
  resolver('respaldo')
}

let respaldoEnMarcha = false
function arrancarRespaldoPeriodico() {
  if (respaldoEnMarcha) return
  respaldoEnMarcha = true
  if (!respaldoActivo()) {
    log('aviso', 'Respaldo de la sesión apagado', 'Definí WA_BACKUP_CLAVE (y R2) para poder restaurar la línea en otra PC sin escanear el QR')
    return
  }
  const respaldarEnvs = () =>
    respaldarEnv().catch((err) => log('aviso', 'No se pudo respaldar la configuración (.env)', err.message))
  respaldarEnvs()
  setInterval(() => sinUsuario(() => respaldarAhora()), 6 * 3600e3).unref()
  setInterval(respaldarEnvs, 24 * 3600e3).unref()
}

let vigiaEnMarcha = false
function arrancarVigia() {
  arrancarRespaldoPeriodico()
  if (vigiaEnMarcha) return
  vigiaEnMarcha = true
  vigilar({
    estado: () => ({ conexion, desde: conexionDesde }),
    ultimaSenalCelular: () => meta().ultimaSenalCelular || null,
    alDespertar: () => {
      if (detenido) return
      intentos = 0
      iniciar().catch((err) => log('error', 'No se pudo reconectar al despertar', err.message))
    },
  })
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
  const version = await versionWa()

  const s = makeWASocket({
    // Sin versión fijada se usa la que trae Baileys: la clave no puede ir con undefined
    // porque pisaría ese valor por defecto.
    ...(version ? { version } : {}),
    auth: state,
    logger,
    // Presentarse como "WhatsApp de escritorio" (Browsers.windows('Desktop')) haría que el
    // celular mande todo el historial, pero WhatsApp corta esa conexión (error 428) y no
    // llega a mostrar el QR. Queda como Chrome, pidiendo el historial completo al vincular.
    // El primer valor es el nombre que el celular muestra en "Dispositivos vinculados" (y
    // al bajar el historial): así nadie lo confunde con otro WhatsApp Web. Se toma al
    // vincular; un dispositivo ya vinculado conserva el nombre que tenía.
    browser: [NOMBRE_DISPOSITIVO, 'Chrome', '10.0.22631'],
    // Si se marca "en línea", el celular deja de recibir notificaciones.
    markOnlineOnConnect: false,
    syncFullHistory: true,
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

  s.ev.on('creds.update', async (c) => {
    await saveCreds(c)
    // Cambió la llave de la sesión: se vuelve a respaldar (agrupado, no en cada cambio).
    programarRespaldo()
  })
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
  // Altas, bajas y cambios de admin: el aviso en el chat llega como mensaje (stub); acá
  // solo se descarta la lista de integrantes guardada, para mencionar con la actualizada.
  s.ev.on('group-participants.update', seguro('integrantes', ({ id }) => integrantes.delete(id)))
}

async function alActualizarConexion(s, { connection, lastDisconnect, qr }) {
  if (qr) {
    qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 8 })
    if (conexion !== 'qr') log('info', 'Código QR listo para escanear')
    if (conexion !== 'qr') conexionDesde = Date.now()
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
    yo = { id, lid: s.user?.lid ? jidNormalizedUser(s.user.lid) : null, nombre: s.user?.name || s.user?.verifiedName || null, telefono: telefonoDe(id) }
    if (s.user?.lid) registrarLid(jidNormalizedUser(s.user.lid), id)
    setConexion('conectado')
    log('ok', 'WhatsApp conectado', yo.telefono || id)
    for (const clave of ['desvinculada', '440', '403', 'sesion-danada']) resolver(clave)
    // Recién vinculada: el celular acaba de escanear, así que está activo.
    if (!meta().ultimaSenalCelular) senalDelCelular()
    // La sesión cambió (o es nueva): se respalda cifrada en R2.
    programarRespaldo(30_000)
    // Lo que quedó en la bandeja de salida mientras no había conexión sale ahora.
    arrancarSalidaPeriodica()
    setTimeout(() => {
      if (s === sock && conexion === 'conectado') sinUsuario(() => procesarSalida().catch((err) => log('aviso', 'Bandeja de salida', err.message)))
    }, 5000)
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
      if (s !== sock || conexion !== 'conectado') return
      pedirFotosDeTodos()
      // Las que figuran guardadas pero no están (borradas, o de otro servidor con la misma base).
      repararFotos()
        .then((n) => n && log('info', 'Fotos de perfil faltantes', `${n} en cola para volver a bajar`))
        .catch((err) => log('aviso', 'No se pudieron revisar las fotos de perfil', err.message))
      // Audios, fotos, stickers, videos y documentos de la ventana que todavía no se bajaron.
      ponerAlDiaArchivos()
        .then((n) => n && log('info', 'Archivos sin descargar', `${n} en cola, de lo más nuevo a lo más viejo`))
        .catch((err) => log('aviso', 'No se pudieron revisar los archivos pendientes', err.message))
    }, 20000)
  }

  if (connection === 'close') {
    const codigo = lastDisconnect?.error?.output?.statusCode
    const motivo = lastDisconnect?.error?.message || 'sin detalle'
    sock = null
    if (detenido) return

    if (codigo === DisconnectReason.loggedOut || codigo === DisconnectReason.multideviceMismatch) {
      log('aviso', 'La sesión se cerró (desde el celular o desde el panel)', 'Hay que escanear el QR de nuevo')
      if (!desvinculandoDesdePanel) {
        alertar('La línea se desvinculó', 'Se cerró la sesión desde el celular (o WhatsApp la dio de baja). Hay que escanear el QR de nuevo desde Conexión.', { clave: 'desvinculada' })
      }
      desvinculandoDesdePanel = false
      borrarSesion()
      setMeta({ chatsSincronizados: null })
      yo = null
      setConexion('conectando')
      programar(1000)
    } else if (codigo === DisconnectReason.restartRequired) {
      log('info', 'Reiniciando la conexión después de vincular')
      programar(0)
    } else if (codigo === DisconnectReason.connectionReplaced) {
      // 440: otra PC (u otro proceso) abrió esta misma sesión. Si se reintenta enseguida,
      // las dos se pisan sin fin; se espera y se avisa para que alguien cierre la otra.
      intentos++
      const espera = intentos <= 1 ? 5 * 60e3 : 30 * 60e3
      log('error', 'Otra conexión abrió esta misma sesión (440)', `Se reintenta en ${espera / 60e3} min. Cerrá el otro servicio (otra PC con la misma carpeta data/sesion).`)
      alertar('Otra PC está usando la misma sesión de WhatsApp', 'Hay dos servidores con la misma sesión (error 440): se desconectan entre sí. Dejá uno solo prendido.', { clave: '440' })
      setConexion('desconectado')
      programar(espera)
    } else if (codigo === DisconnectReason.forbidden) {
      // 403: WhatsApp rechaza la cuenta (suele ser un bloqueo). Se reintenta cada 30 min.
      log('error', 'WhatsApp rechazó la conexión (403)', 'Puede ser un bloqueo del número: revisá el celular. Se reintenta cada 30 min.')
      alertar('WhatsApp rechazó la conexión (403)', 'Puede ser un bloqueo o una restricción del número. Revisá el celular de la concesionaria; ver "Plan si bloquean el número" en docs/OPERACION.md.', { clave: '403' })
      setConexion('desconectado')
      programar(30 * 60e3)
    } else if (codigo === 405) {
      // Versión del protocolo vieja: se consulta la vigente y se reintenta enseguida.
      log('aviso', 'WhatsApp rechazó la versión del protocolo (405)', 'Se consulta la versión vigente')
      actualizarVersion = true
      setConexion('conectando')
      programar(2000)
    } else if (codigo === DisconnectReason.badSession) {
      // Sesión dañada: a veces se arregla sola; si no, hay que restaurar el respaldo o vincular de nuevo.
      intentos++
      if (intentos >= 3) {
        alertar('La sesión de WhatsApp está dañada', 'Falló varias veces seguidas (error 500). Restaurá el último respaldo (npm run restaurar) o desvinculá y escaneá el QR.', { clave: 'sesion-danada' })
      }
      const espera = Math.min(10 * 60e3, 5000 * 2 ** Math.min(intentos - 1, 6))
      log('error', 'Sesión dañada (500)', `Reintento ${intentos} en ${Math.round(espera / 1000)} s · ${motivo}`)
      setConexion('conectando')
      programar(espera)
    } else {
      // Cortes de red, timeouts (408), conexión cerrada (428), servicio caído (503): se
      // reintenta siempre, con espera creciente hasta un minuto.
      intentos++
      const espera = Math.min(60000, 2000 * 2 ** Math.min(intentos - 1, 5))
      log('aviso', `Conexión perdida (${codigo ?? 'sin código'})`, `Reintento ${intentos} en ${Math.round(espera / 1000)} s · ${motivo}`)
      setConexion('conectando')
      programar(espera)
    }
  }
}

let desvinculandoDesdePanel = false
export async function desvincular() {
  log('aviso', 'Desvinculando la línea desde el panel')
  desvinculandoDesdePanel = true
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
    case 'audioMessage': r = { tipo: c.ptt ? 'nota_voz' : 'audio', media: medio(c, { segundos: c.seconds, ...(c.waveform?.length ? { ondas: [...c.waveform] } : {}) }) }; break
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
  if (r && c?.contextInfo?.mentionedJid?.length) r.mencionados = c.contextInfo.mentionedJid
  return r
}

/*
 * Fotos, videos y audios "para ver una vez". Quien los manda pidió que no queden
 * guardados, así que no se baja ni se guarda el archivo (ni el mensaje crudo, que tiene la
 * llave para bajarlo): en el chat queda solo el aviso, como en WhatsApp Web.
 */
function esUnaVez(message, content) {
  if (!message) return false
  if (message.viewOnceMessage || message.viewOnceMessageV2 || message.viewOnceMessageV2Extension) return true
  return !!content?.[getContentType(content)]?.viewOnce
}

const QUE_ES = { imagen: 'Foto', video: 'Video', gif: 'Video', nota_voz: 'Audio', audio: 'Audio' }
const avisoUnaVez = (tipo) => `${QUE_ES[tipo] || 'Archivo'} para ver una vez. Se abre solo en el celular.`

/** Borra lo que se haya guardado de mensajes "para ver una vez" (de antes de este freno). */
export async function limpiarUnaVez() {
  const encontrados = []
  recorrerMensajes((jid, m) => {
    if (!m.media || !m.raw) return
    try {
      const { message } = JSON.parse(m.raw)
      if (esUnaVez(message, normalizeMessageContent(message))) encontrados.push([jid, m])
    } catch {
      // Mensaje crudo ilegible: se deja como está.
    }
  })
  for (const [jid, m] of encontrados) {
    if (m.media.archivo) await borrarArchivo(claveMedia(jid, m.media.archivo)).catch(() => {})
    actualizarMensaje(jid, m.id, { tipo: 'una_vez', texto: avisoUnaVez(m.tipo), media: null, raw: null })
  }
  return encontrados.length
}

/* ---------------- Ventana de días y archivos pendientes ---------------- */

/**
 * Borra lo que quedó fuera de la ventana de días: mensajes (de la memoria y de la base),
 * sus archivos (de R2 o del disco) y los chats que quedaron vacíos. Corre al arrancar y
 * una vez por día.
 */
export async function purgarVentana() {
  return purgarVentanaAhora()
}

/** Claves de archivo que algún mensaje o foto de perfil necesita (todo lo demás sobra). */
function archivosEnUso() {
  const usados = new Set()
  recorrerMensajes((jid, m) => {
    if (m.media?.archivo) usados.add(claveMedia(jid, m.media.archivo))
    if (m.media?.miniatura) usados.add(m.media.miniatura)
  })
  for (const jid of conFotoGuardada()) usados.add(claveFoto(jid))
  return usados
}

/**
 * Conciliación de R2 contra lo que referencian los mensajes: borra los archivos que no usa
 * nadie (quedaron de un chat borrado, de una descarga cortada, etc.). Con freno: no toca
 * nada de menos de un día, ni carpetas con una mudanza pendiente, y si sobra demasiado
 * (señal de que algo no cargó bien) no borra y avisa.
 */
/* ---------------- Tope de espacio en R2 (ver cuota.js) ---------------- */

const gb = (n) => `${(n / 1024 ** 3).toFixed(2)} GB`
let liberando = null

/**
 * Si el bucket pasó el 85 % del tope, borra los archivos más viejos (y sus miniaturas)
 * hasta bajar al 75 %. Los mensajes quedan, con el aviso "archivo borrado para liberar
 * espacio" (estado 'liberado'), y no se vuelven a bajar solos.
 */
export function liberarEspacio() {
  if (!cuota.activa() || cuota.fraccion() < cuota.UMBRAL_LIMPIEZA) return Promise.resolve(null)
  liberando ??= sinUsuario(async () => {
    const objetivo = cuota.LIMITE * cuota.OBJETIVO_LIMPIEZA
    let usado = cuota.estadoCuota().usado
    const candidatos = []
    recorrerMensajes((jid, m) => {
      if (m.media?.estado === 'ok' && m.media.archivo) candidatos.push({ jid, id: m.id, ts: m.ts || 0 })
    })
    candidatos.sort((a, b) => a.ts - b.ts)
    let borrados = 0
    let bytes = 0
    for (const c of candidatos) {
      if (usado <= objetivo) break
      const m = buscarMensaje(c.jid, c.id)
      if (m?.media?.estado !== 'ok' || !m.media.archivo) continue
      const tamano = m.media.tamano || 0
      await borrarArchivo(claveMedia(c.jid, m.media.archivo)).catch(() => {})
      if (m.media.miniatura) await borrarArchivo(m.media.miniatura).catch(() => {})
      actualizarMensaje(c.jid, c.id, { media: { ...m.media, estado: 'liberado', archivo: null, miniatura: null } })
      usado -= tamano
      bytes += tamano
      borrados++
    }
    await medirR2().catch(() => {})
    if (borrados) {
      const detalle = `${borrados} archivos (${gb(bytes)}), los más viejos · quedan ${gb(cuota.estadoCuota().usado || 0)} de ${gb(cuota.LIMITE)}`
      log('aviso', 'Se borraron archivos viejos para no pasar el tope de R2', detalle)
      alertar('Se borraron archivos viejos del WhatsApp', `${detalle}. Es para no pasar el plan gratuito de Cloudflare R2 (WA_R2_LIMITE_GB). Los mensajes quedan; solo se borró el archivo.`, { clave: 'r2-espacio', nivel: 'aviso' })
    }
    return { borrados, bytes }
  }).finally(() => (liberando = null))
  return liberando
}

/** Mide el bucket al arrancar y cada 6 horas; si hace falta, libera espacio. */
export async function vigilarEspacio() {
  if (!cuota.activa()) return null
  const revisar = async () => {
    try {
      await medirR2()
      await liberarEspacio()
    } catch (err) {
      log('aviso', 'No se pudo medir el espacio de R2', err.message)
    }
  }
  await revisar()
  setInterval(revisar, 6 * 3600e3).unref()
  const { usado, limite } = cuota.estadoCuota()
  return { usado, limite }
}

export async function reconciliarArchivos({ simular = false } = {}) {
  const usados = archivosEnUso()
  const enMudanza = (meta().mudanzasPendientes || []).map((m) => `${m.desde}/`)
  const unDia = Date.now() - 86400e3
  const todos = []
  for (const prefijo of ['media/', 'miniaturas/', 'fotos/']) todos.push(...(await listarArchivos(prefijo)))
  const huerfanos = todos.filter((a) => !usados.has(a.clave) && a.fecha < unDia && !enMudanza.some((p) => a.clave.startsWith(p)))
  const bytes = huerfanos.reduce((t, a) => t + a.tamano, 0)
  if (huerfanos.length > 50 && huerfanos.length > todos.length * 0.3) {
    alertar('Conciliación de archivos frenada', `${huerfanos.length} de ${todos.length} archivos parecen huérfanos: es demasiado, no se borró nada. Revisá que los mensajes hayan cargado bien.`, { clave: 'conciliacion', nivel: 'aviso' })
    return { huerfanos: huerfanos.length, borrados: 0, bytes, frenada: true }
  }
  if (!simular) for (const a of huerfanos) await borrarArchivo(a.clave).catch(() => {})
  return { huerfanos: huerfanos.length, borrados: simular ? 0 : huerfanos.length, bytes, total: todos.length }
}

/**
 * Borra un chat del respaldo: mensajes, archivos (su carpeta entera en R2), foto de
 * perfil y el chat en sí. No toca WhatsApp: en el celular el chat sigue estando.
 */
export async function borrarChat(chatId) {
  const { mensajes, carpeta } = borrarChatEntero(chatId)
  let archivos = 0
  for (const a of await listarArchivos(`media/${carpeta}/`)) {
    await borrarArchivo(a.clave).catch(() => {})
    archivos++
  }
  for (const m of mensajes) if (m.media?.miniatura) await borrarArchivo(m.media.miniatura).catch(() => {})
  await borrarArchivo(claveFoto(chatId)).catch(() => {})
  log('aviso', 'Chat borrado del respaldo', `${nombreDe(chatId)} · ${mensajes.length} mensajes · ${archivos} archivos`)
  return { mensajes: mensajes.length, archivos }
}

async function purgarVentanaAhora() {
  const { quitados, chats } = quitarAnterioresA(corteVentana())
  let archivos = 0
  for (const { jid, m } of quitados) {
    if (!m.media?.archivo) continue
    await borrarArchivo(claveMedia(jid, m.media.archivo)).catch(() => {})
    archivos++
  }
  return { mensajes: quitados.length, archivos, chats }
}

/**
 * Pone en la cola todo archivo de la ventana que todavía no se bajó (fotos, audios,
 * stickers, videos, documentos), de lo más nuevo a lo más viejo. Corre al conectar: la
 * cola vive en memoria y un reinicio o un corte la deja a medias. Lo que ya falló se
 * reintenta una sola vez por arranque.
 */
export async function ponerAlDiaArchivos() {
  // Primero, lo que figura descargado pero no está (se guardó en un disco que ya no
  // existe, o se borró a mano): vuelve a "sin descargar". Así el panel no pide archivos
  // que no hay (404) y entran a la cola de abajo.
  const hay = new Set((await listarArchivos('media/')).map((a) => a.clave))
  const perdidos = []
  recorrerMensajes((chatId, m) => {
    if (m.media?.estado === 'ok' && m.media.archivo && !hay.has(claveMedia(chatId, m.media.archivo))) perdidos.push([chatId, m])
  })
  for (const [chatId, m] of perdidos) {
    actualizarMensaje(chatId, m.id, { media: { ...m.media, archivo: null, estado: 'pendiente', error: null, fallos: 0 } })
  }
  if (perdidos.length) log('aviso', 'Archivos que figuraban guardados y no estaban', `${perdidos.length} vuelven a descargarse`)

  if (!config().descargarMedia) return 0
  const corte = corteVentana()
  const faltan = []
  recorrerMensajes((chatId, m) => {
    const md = m.media
    if (!md || !m.raw || md.estado === 'ok' || md.estado === 'grande' || md.estado === 'liberado' || (m.ts || 0) < corte) return
    faltan.push({ chatId, m })
  })
  faltan.sort((a, b) => (b.m.ts || 0) - (a.m.ts || 0))
  // Lo que ya falló se reintenta una vez por semana como mucho, aunque el servidor se
  // reinicie (queda anotado): insistir enseguida no lo recupera y le pega a WhatsApp.
  const reintentos = { ...(meta().reintentosMedia || {}) }
  const semana = 7 * 86400e3
  for (const [llave, ts] of Object.entries(reintentos)) if (Date.now() - ts > semana) delete reintentos[llave]
  let n = 0
  for (const { chatId, m } of faltan) {
    const llave = `${chatId}|${m.id}`
    const forzar = seDaPorPerdido(m) && !reintentos[llave]
    if (forzar) reintentos[llave] = Date.now()
    if (encolarMedia(chatId, m.id, { forzar })) n++
  }
  setMeta({ reintentosMedia: reintentos })
  // Lo que ya estaba en la cola de antes de un corte también tiene que seguir bajando.
  arrancarCola()
  return n
}

/* ---------------- Eventos de mensajes ---------------- */

async function procesarEntrante(m, tipoUpsert, origen = 'vivo') {
  const key = m.key
  if (!key?.remoteJid || ignorar(key.remoteJid)) return
  const content = normalizeMessageContent(m.message)
  // Sin contenido: avisos de grupo (se guardan como aviso), otros avisos del sistema o
  // mensajes que no se pudieron descifrar.
  if (!content) {
    if (m.messageStubType && esGrupo(key.remoteJid)) await procesarAvisoGrupo(m, origen)
    return
  }
  // Borrados, ediciones y reacciones llegan por messages.update / messages.reaction.
  if (content.protocolMessage || content.reactionMessage) return
  let datos = interpretar(content)
  if (!datos) return
  if (datos.media && esUnaVez(m.message, content)) {
    datos = { tipo: 'una_vez', texto: avisoUnaVez(datos.tipo), ...(datos.citado ? { citado: datos.citado } : {}) }
  }

  const chatId = await jidDelChat(key)
  const deMi = !!key.fromMe
  const grupo = esGrupo(chatId)
  const ts = toNumber(m.messageTimestamp) || ahora()
  // Más viejo que la ventana de días (llega con el historial): no se guarda.
  if (ts < corteVentana()) return
  // En un grupo el pushName es del autor: no puede pasar a ser el nombre del chat.
  if (!deMi && !grupo) actualizarPushName(chatId, m.pushName)

  const { mencionados, ...resto } = datos
  const mensaje = { id: key.id, deMi, ts, ...resto, origen }
  // Menciones (@): qué nombre mostrar en lugar de cada "@número" del texto.
  if (mencionados?.length) mensaje.menciones = nombresDeMenciones(mencionados)
  if (deMi) mensaje.estado = ESTADOS[m.status] || 'enviado'
  // Mandado desde el panel: queda firmado con quien lo mandó desde que se guarda.
  if (deMi && firmasPendientes.has(key.id)) mensaje.enviadoPor = firmasPendientes.get(key.id)
  // Un mensaje propio que no salió del panel lo mandaron desde el celular: está activo.
  if (deMi && origen === 'vivo' && !idsDelPanel.has(key.id)) senalDelCelular()

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
        const extras = await extrasDeArchivo(chatId, { id: key.id, tipo: datos.tipo, media: datos.media }, propio)
        mensaje.media = { ...datos.media, archivo, tamano: propio.length, estado: 'ok', ...extras }
      } catch (err) {
        // Queda como pendiente: se puede volver a bajar de WhatsApp con el mensaje crudo.
        log('aviso', 'No se pudo guardar un archivo enviado', err.message)
      }
    }
  }

  const { nuevo, mensaje: guardado } = agregarMensaje(chatId, mensaje)
  // Si el tilde llegó antes que el mensaje, se aplica ahora.
  if (deMi) aplicarEstadoTemprano(chatId, guardado)
  if (!nuevo) return
  if (grupo) pedirNombreGrupo(chatId)
  if (tipoUpsert === 'notify') pedirFotos([chatId])
  if (tipoUpsert === 'notify' && !deMi) {
    sumarNoLeido(chatId)
    // Igual que el celular: si la cuenta tiene activado "desarchivar al recibir mensajes", el chat vuelve a la lista.
    const creds = sock?.authState?.creds || authActual?.creds
    if (estaArchivado(chatId) && creds?.accountSettings?.unarchiveChats) setArchivado(chatId, false)
  }

  // 'liberado': se borró para no pasar el tope de R2 (ver liberarEspacio); no se vuelve a bajar solo.
  if (guardado.media && !['ok', 'liberado'].includes(guardado.media.estado) && config().descargarMedia) {
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
    if (!nuevo) return
    const m = buscarMensaje(chatId, key.id)
    // El tilde puede llegar antes de que termine de guardarse el mensaje (los dos avisos de
    // WhatsApp vienen casi juntos): se guarda un momento y se aplica al guardarlo.
    if (!m) {
      if (key.fromMe) anotarEstadoTemprano(key.id, nuevo)
      return
    }
    if (m.deMi) aplicarEstado(chatId, m, nuevo)
  }
}

/** Sube el estado de un mensaje propio (nunca lo baja: un "leído" no vuelve a "enviado"). */
function aplicarEstado(chatId, m, nuevo) {
  if (nuevo === 'error' || ORDEN.indexOf(nuevo) > ORDEN.indexOf(m.estado)) actualizarMensaje(chatId, m.id, { estado: nuevo })
}

// Estados que llegaron antes que su mensaje: id → { estado, ts }. Viven 2 minutos.
const estadosTempranos = new Map()
function anotarEstadoTemprano(id, estado) {
  const previo = estadosTempranos.get(id)
  if (previo && estado !== 'error' && ORDEN.indexOf(estado) <= ORDEN.indexOf(previo.estado)) return
  estadosTempranos.set(id, { estado, ts: Date.now() })
  if (estadosTempranos.size > 500) estadosTempranos.delete(estadosTempranos.keys().next().value)
}
function aplicarEstadoTemprano(chatId, m) {
  const e = estadosTempranos.get(m.id)
  if (!e) return
  estadosTempranos.delete(m.id)
  if (Date.now() - e.ts < 120_000 && m.deMi) aplicarEstado(chatId, m, e.estado)
}

/**
 * Alguien eliminó un mensaje para todos. Con el anti-borrado encendido
 * (WA_CONSERVAR_ELIMINADOS, por defecto) se marca y el original queda guardado. Apagado,
 * se hace como en el celular: el mensaje pierde el texto y el archivo, queda solo el aviso.
 */
function marcarEliminado(chatId, id, claveRevoke) {
  const por = claveRevoke?.fromMe ? 'yo' : 'contacto'
  const eliminado = { ts: ahora(), por }
  const m = buscarMensaje(chatId, id)
  if (m) {
    if (m.eliminado) return
    if (CONSERVAR_ELIMINADOS) {
      actualizarMensaje(chatId, id, { eliminado })
    } else {
      if (m.media?.archivo) borrarArchivo(claveMedia(chatId, m.media.archivo)).catch(() => {})
      if (m.media?.miniatura) borrarArchivo(m.media.miniatura).catch(() => {})
      actualizarMensaje(chatId, id, { eliminado, texto: '', media: null, raw: null, ediciones: null, ubicacion: null })
    }
    const que = por === 'yo' ? 'Se eliminó un mensaje enviado por la línea' : 'Un contacto eliminó un mensaje'
    log('aviso', que, `${nombreDe(chatId)} · ${CONSERVAR_ELIMINADOS ? 'el original quedó guardado' : 'se borró también del respaldo'}`)
  } else {
    agregarMensaje(chatId, { id, deMi: por === 'yo', ts: eliminado.ts, tipo: 'desconocido', texto: '', eliminado, origen: 'vivo' })
    log('aviso', 'Se eliminó un mensaje que no estaba guardado', `${nombreDe(chatId)} · había llegado antes de conectar el sistema`)
  }
}

/** Un mensaje editado. Con WA_CONSERVAR_EDICIONES (por defecto) se guarda la versión anterior. */
function marcarEditado(chatId, id, contenido, ts) {
  const m = buscarMensaje(chatId, id)
  const texto = textoDe(contenido)
  if (!m || texto === m.texto) return
  if (CONSERVAR_EDICIONES) {
    const ediciones = [...(m.ediciones || []), { texto: m.texto || '', ts: ts || ahora() }]
    actualizarMensaje(chatId, id, { texto, ediciones, editado: ts || ahora() })
  } else {
    actualizarMensaje(chatId, id, { texto, ediciones: null, editado: ts || ahora() })
  }
  log('info', 'Se editó un mensaje', `${nombreDe(chatId)} · ${CONSERVAR_EDICIONES ? 'la versión anterior quedó guardada' : 'se reemplazó el texto'}`)
}

async function procesarReaccion({ key, reaction }) {
  const claveChat = reaction?.key?.remoteJid ? reaction.key : key
  if (!claveChat?.remoteJid || ignorar(claveChat.remoteJid)) return
  const chatId = await jidDelChat(claveChat)
  const m = buscarMensaje(chatId, key.id)
  if (!m) return
  // Una reacción por persona: en un grupo cada integrante tiene la suya (si no, la de uno
  // pisaba la del otro). En un chat 1 a 1 alcanza con "yo" y "contacto".
  let quien = reaction.key?.fromMe ? 'yo' : 'contacto'
  const participante = reaction.key?.participant || reaction.key?.participantAlt
  const cambios = {}
  if (quien === 'contacto' && esGrupo(chatId) && participante) {
    const jid = jidNormalizedUser(participante)
    quien = (isLidUser(jid) && pnDeLid(jid)) || jid
    // El nombre de quien reaccionó, para mostrarlo al pasar el mouse.
    cambios.reactores = { ...m.reactores, [quien]: nombreParticipante(jid) }
  }
  actualizarMensaje(chatId, key.id, { reacciones: { ...m.reacciones, [quien]: reaction.text || null }, ...cambios })
}

/* ---------------- Avisos de grupo ("X agregó a Y") ---------------- */

const AVISOS_GRUPO = {
  [WAMessageStubType.GROUP_CREATE]: (a, ps, p) => `${a} creó el grupo${p[0] ? ` "${p[0]}"` : ''}`,
  [WAMessageStubType.GROUP_CHANGE_SUBJECT]: (a, ps, p) => `${a} cambió el asunto a "${p[0] || ''}"`,
  [WAMessageStubType.GROUP_CHANGE_ICON]: (a) => `${a} cambió la foto del grupo`,
  [WAMessageStubType.GROUP_CHANGE_DESCRIPTION]: (a) => `${a} cambió la descripción del grupo`,
  [WAMessageStubType.GROUP_CHANGE_ANNOUNCE]: (a, ps, p) => (p[0] === 'on' ? `${a} hizo que solo los admins puedan escribir` : `${a} permitió que todos escriban`),
  [WAMessageStubType.GROUP_CHANGE_RESTRICT]: (a, ps, p) => (p[0] === 'on' ? `${a} hizo que solo los admins editen la info del grupo` : `${a} permitió que todos editen la info del grupo`),
  [WAMessageStubType.GROUP_PARTICIPANT_ADD]: (a, ps, p, mismo) => (mismo ? `${ps} se unió` : `${a} agregó a ${ps}`),
  [WAMessageStubType.GROUP_PARTICIPANT_REMOVE]: (a, ps, p, mismo) => (mismo ? `${ps} salió del grupo` : `${a} sacó a ${ps}`),
  [WAMessageStubType.GROUP_PARTICIPANT_LEAVE]: (a, ps) => `${ps} salió del grupo`,
  [WAMessageStubType.GROUP_PARTICIPANT_INVITE]: (a, ps) => `${ps} se unió con el enlace de invitación`,
  [WAMessageStubType.GROUP_PARTICIPANT_ACCEPT]: (a, ps) => `${ps} se unió al grupo`,
  [WAMessageStubType.GROUP_PARTICIPANT_PROMOTE]: (a, ps) => `${a} hizo admin a ${ps}`,
  [WAMessageStubType.GROUP_PARTICIPANT_DEMOTE]: (a, ps) => `${ps} ya no es admin`,
  [WAMessageStubType.GROUP_PARTICIPANT_CHANGE_NUMBER]: (a) => `${a} cambió su número`,
}

/** Nombre para mostrar de un jid de grupo (teléfono o LID); la línea es "Vos". */
function nombreParticipante(crudo) {
  if (!crudo) return 'Alguien'
  const jid = jidNormalizedUser(crudo)
  const pn = isLidUser(jid) ? pnDeLid(jid) : jid
  if (yo && (jid === yo.id || jid === yo.lid || pn === yo.id)) return 'Vos'
  return nombreDe(pn || jid)
}

/**
 * Los cambios de un grupo llegan como "mensajes de sistema" sin contenido (stubs): se
 * guardan como un aviso en el chat, como en WhatsApp. Además, la lista de integrantes del
 * grupo deja de servir: se vuelve a pedir la próxima vez.
 */
async function procesarAvisoGrupo(m, origen) {
  const armar = AVISOS_GRUPO[m.messageStubType]
  if (!armar) return
  const chatId = m.key.remoteJid
  const ts = toNumber(m.messageTimestamp) || ahora()
  if (ts < corteVentana()) return
  const autorJid = m.key.participant || m.participant || null
  const params = (m.messageStubParameters || []).map(String)
  const esJid = (p) => /@(s\.whatsapp\.net|lid)$/.test(p)
  const personas = params.filter(esJid)
  const lista = personas.map(nombreParticipante).join(', ') || 'alguien'
  const mismo = personas.length === 1 && autorJid && jidNormalizedUser(personas[0]) === jidNormalizedUser(autorJid)
  const texto = armar(nombreParticipante(autorJid), lista, params.filter((p) => !esJid(p)), mismo)
  if (m.messageStubType === WAMessageStubType.GROUP_CHANGE_SUBJECT && params[0]) setGrupoNombre(chatId, params[0])
  integrantes.delete(chatId)
  agregarMensaje(chatId, { id: m.key.id, deMi: !!m.key.fromMe, ts, tipo: 'sistema', texto, origen })
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
  const chatId = await jidDelChat({ remoteJid: id })
  if (esGrupo(chatId)) {
    // En un grupo la presencia viene por integrante: se avisa quién escribe o graba
    // ("Seba está escribiendo…"), como en WhatsApp.
    const activo = Object.entries(presences || {}).find(([, d]) => ['composing', 'recording'].includes(d?.lastKnownPresence))
    const p = activo
      ? { estado: activo[1].lastKnownPresence, quien: nombreParticipante(activo[0]), visto: null, ts: ahora() }
      : { estado: 'available', quien: null, visto: null, ts: ahora() }
    presencias.set(chatId, p)
    emitir('presencia', { chatId, ...p })
    return
  }
  const datos = Object.values(presences || {})[0]
  if (!datos) return
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
/* ---------------- Integrantes de grupos y menciones (@) ---------------- */

// chatId → [{ jid (como lo usa el grupo: teléfono o LID), telefono, nombre }]. Se llena al
// abrir la ficha o pedir los integrantes, y con los avisos de altas y bajas.
const integrantes = new Map()

function guardarIntegrantes(chatId, g) {
  const lista = (g?.participants || [])
    .map((p) => {
      const crudo = p?.id || p?.jid
      if (!crudo) return null
      const jid = jidNormalizedUser(crudo)
      const pn = isLidUser(jid) ? (p.phoneNumber && jidNormalizedUser(p.phoneNumber)) || pnDeLid(jid) || null : jid
      return { jid, telefono: pn ? telefonoDe(pn) : null, nombre: nombreDe(pn || jid) }
    })
    .filter(Boolean)
  integrantes.set(chatId, lista)
  return lista
}

/** Integrantes de un grupo para mencionar con @ (los pide a WhatsApp si no están). */
export async function integrantesDe(chatId) {
  if (!esGrupo(chatId)) return []
  if (!integrantes.has(chatId) && sock && conexion === 'conectado') {
    try {
      guardarIntegrantes(chatId, await sock.groupMetadata(chatId))
    } catch {
      // Grupo del que ya no se forma parte: sin integrantes para mencionar.
    }
  }
  const yoJid = yo?.id
  return (integrantes.get(chatId) || []).filter((p) => p.jid !== yoJid && p.jid !== yo?.lid)
}

/**
 * A quién menciona un mensaje de grupo: los que eligió el panel (`explicitas`) y cada
 * "@número" del texto que sea de un integrante. WhatsApp necesita la lista aparte del
 * texto para que la mención le avise al mencionado.
 */
function mencionesDe(chatId, texto, explicitas = []) {
  if (!esGrupo(chatId)) return null
  const lista = integrantes.get(chatId) || []
  const set = new Set((Array.isArray(explicitas) ? explicitas : []).filter((j) => typeof j === 'string' && /^\d+@(s\.whatsapp\.net|lid)$/.test(j)))
  for (const [, digitos] of String(texto).matchAll(/@(\d{6,15})/g)) {
    const p = lista.find((x) => x.jid.startsWith(`${digitos}@`) || (x.telefono || '').replace(/\D/g, '') === digitos)
    set.add(p ? p.jid : `${digitos}@s.whatsapp.net`)
  }
  return set.size ? [...set] : null
}

/** "@número" → nombre, para mostrar las menciones de un mensaje recibido. */
function nombresDeMenciones(jids = []) {
  const mapa = {}
  for (const crudo of jids) {
    const jid = jidNormalizedUser(crudo)
    const pn = isLidUser(jid) ? pnDeLid(jid) : jid
    mapa[jid.split('@')[0]] = yo && (jid === yo.id || pn === yo.id) ? 'Vos' : nombreDe(pn || jid)
  }
  return mapa
}

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
    guardarIntegrantes(chatId, g)
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
      try {
        wa = await conTimeout(
          sock.updateMediaMessage(wa),
          REENVIO_TIMEOUT_MS,
          'El celular no respondió al pedido de reenvío. Revisá que tenga internet y volvé a intentar.',
        )
      } catch (errReenvio) {
        if (/no respondió/.test(errReenvio.message)) celularNoResponde()
        throw errReenvio
      }
      // Respondió: el celular está conectado.
      senalDelCelular()
      buffer = await downloadMediaMessage(wa, 'buffer', {})
      // El reenvío trae un enlace nuevo: se guarda para no tener que pedirlo otra vez.
      actualizarMensaje(chatId, m.id, {
        raw: JSON.stringify({ key: wa.key, message: wa.message, messageTimestamp: wa.messageTimestamp }, BufferJSON.replacer),
      })
    }
    const archivo = `${m.id}.${extensionDe(m.media.mime, m.media.nombre)}`
    await guardarMedia(chatId, archivo, buffer, m.media.mime)
    const extras = await extrasDeArchivo(chatId, m, buffer)
    if (cuota.fraccion() >= cuota.UMBRAL_LIMPIEZA) liberarEspacio()
    return actualizarMensaje(chatId, m.id, { media: { ...m.media, archivo, tamano: buffer.length, estado: 'ok', error: null, fallos: 0, ...extras } })
  } catch (err) {
    // Sin espacio en R2: se libera lo más viejo y el archivo queda para reintentar.
    if (err.code === 'SIN_ESPACIO') liberarEspacio()
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
      if (m?.media && !['ok', 'liberado'].includes(m.media.estado) && m.raw) {
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
    if (!m.media || m.media.estado === 'ok' || m.media.estado === 'liberado' || !m.raw) continue
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
/**
 * Lo que se arma una vez que el archivo está bajado: la miniatura de fotos y videos (480 px,
 * en miniaturas/, para que la lista no baje fotos de varios MB) y la forma de onda real de
 * los audios que no la traen. Si falla, el archivo se guarda igual.
 */
async function extrasDeArchivo(chatId, m, buffer) {
  const extras = {}
  const mime = String(m.media?.mime || '')
  if (['imagen', 'video', 'gif'].includes(m.tipo) && /^(image\/(jpeg|png|webp|gif|heic|heif)|video\/)/.test(mime)) {
    try {
      const clave = claveMedia(chatId, `${m.id}.jpg`).replace(/^media\//, 'miniaturas/')
      await guardarArchivo(clave, await miniatura(buffer, mime), 'image/jpeg')
      extras.miniatura = clave
    } catch {
      // Sin miniatura: el panel muestra el archivo completo, como antes.
    }
  }
  if (['nota_voz', 'audio'].includes(m.tipo) && !m.media?.ondas?.length) {
    const ondas = await formaDeOnda(buffer).catch(() => null)
    if (ondas) extras.ondas = ondas
  }
  return extras
}

/**
 * Miniatura de una foto o video: la que se armó al bajarlo (480 px) o, si todavía no está
 * bajado, la chiquita que manda WhatsApp adentro del mensaje. null si no hay ninguna.
 */
export async function obtenerMiniatura(chatId, id) {
  const m = buscarMensaje(chatId, id)
  if (!m?.media) return null
  if (m.media.miniatura) {
    const b = await leerArchivo(m.media.miniatura).catch(() => null)
    if (b) return b
  }
  if (!m.raw) return null
  try {
    const crudo = JSON.parse(m.raw, BufferJSON.reviver)
    const c = normalizeMessageContent(crudo.message)
    const thumb = c?.[getContentType(c)]?.jpegThumbnail
    return thumb?.length ? Buffer.from(thumb) : null
  } catch {
    return null
  }
}

export function obtenerMedia(chatId, id) {
  const m = buscarMensaje(chatId, id)
  if (!m?.media?.archivo || !existeMedia(chatId, m.media.archivo)) {
    throw Object.assign(new Error('El archivo todavía no está descargado'), { status: 404 })
  }
  return { clave: claveMedia(chatId, m.media.archivo), mime: m.media.mime, nombre: m.media.nombre }
}

/**
 * El archivo del mensaje figuraba como guardado y no está (se borró, o lo guardó otro
 * servidor): vuelve a "sin descargar", así la pantalla ofrece bajarlo otra vez.
 */
export function archivoPerdido(chatId, id) {
  const m = buscarMensaje(chatId, id)
  if (!m?.media?.archivo) return
  log('aviso', 'Faltaba un archivo guardado', `${nombreDe(chatId)} · se puede volver a descargar`)
  actualizarMensaje(chatId, id, { media: { ...m.media, archivo: null, estado: 'pendiente', error: null, fallos: 0 } })
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

/** Manda un mensaje. `firmante` ({ id, nombre }): quién lo escribió, si no es el usuario del pedido. */
async function enviar(chatId, contenido, buffer, quoted, firmante) {
  asegurarConectado()
  const messageId = generateMessageIDV2(sock.user?.id)
  idsDelPanel.add(messageId)
  // Quién lo manda se anota ANTES de mandarlo, con el id: así queda firmado apenas se guarda,
  // aunque WhatsApp avise del mensaje antes de que vuelva el envío.
  const u = firmante || usuarioActual()
  if (u) {
    firmasPendientes.set(messageId, { id: u.id, nombre: u.nombre })
    setTimeout(() => firmasPendientes.delete(messageId), 120_000).unref?.()
  }
  if (idsDelPanel.size > 1000) idsDelPanel.delete(idsDelPanel.values().next().value)
  if (buffer) mediaPropia.set(messageId, buffer)
  try {
    const enviado = await sock.sendMessage(chatId, contenido, { messageId, quoted })
    if (enviado?.message) {
      enviados.set(enviado.key.id, enviado.message)
      if (enviados.size > 500) enviados.delete(enviados.keys().next().value)
    }
    // Normalmente ya lo guardó messages.upsert; esto cubre el caso en que no llegue.
    if (enviado && !buscarMensaje(chatId, enviado.key.id)) await procesarEntrante(enviado, 'append')
    if (enviado) {
      firmarEnviado(chatId, enviado.key.id, firmante)
      // Salió por la conexión: deja de ser "pendiente" (un tilde) aunque el acuse del
      // servidor de WhatsApp se demore o se pierda. Después sube a entregado/leído.
      const guardado = buscarMensaje(chatId, enviado.key.id)
      if (guardado?.estado === 'pendiente') aplicarEstado(chatId, guardado, 'enviado')
    }
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
function firmarEnviado(chatId, id, firmante = null) {
  const u = firmante || usuarioActual() || firmasPendientes.get(id)
  const m = id ? buscarMensaje(chatId, id) : null
  if (!u || !m || m.enviadoPor) return
  actualizarMensaje(chatId, id, { enviadoPor: { id: u.id, nombre: u.nombre } })
}

// Mensajes mandados desde el panel que todavía no se guardaron: id → { id, nombre } de quien
// los mandó (ver enviar). procesarEntrante los firma al guardarlos.
const firmasPendientes = new Map()

/** Mensaje a citar, armado con lo guardado: Baileys necesita la clave y el contenido original. */
function mensajeCitado(chatId, id) {
  const m = id ? buscarMensaje(chatId, id) : null
  if (!m) return undefined
  const message = m.raw ? JSON.parse(m.raw, BufferJSON.reviver).message : { conversation: m.texto || '' }
  return { key: claveMensaje(chatId, m), message }
}

/* ---------------- Bandeja de salida ---------------- */

/*
 * Si se manda algo con WhatsApp desconectado (o se corta justo al mandar), no se pierde:
 * queda en el chat como un borrador "en cola" (con su archivo guardado), persistido como
 * cualquier mensaje (diario local + Supabase), y se manda solo, en orden, apenas vuelve la
 * conexión, firmado por quien lo escribió. Cuando sale, el borrador se reemplaza por el
 * mensaje real. Si falla por otra cosa queda en "error" (se puede reintentar o descartar).
 */
const SALIDA_MAX_INTENTOS = 5
const esCorte = (err) =>
  /no está conectado|connection (closed|terminated|lost)|timed? ?out|econn|socket|not open|precondition|stream errored/i.test(err?.message || '')

/** Contenido de Baileys para un pedido de envío (lo comparten el envío directo y la cola). */
function contenidoDe(p, buffer) {
  if (p.tipo === 'texto') {
    const contenido = { text: p.texto }
    if (p.menciones?.length) contenido.mentions = p.menciones
    return contenido
  }
  if (p.tipo === 'nota_voz') {
    const contenido = { audio: buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true }
    if (p.segundos > 0) contenido.seconds = Math.round(p.segundos)
    if (p.ondas?.length) contenido.waveform = Uint8Array.from(p.ondas)
    return contenido
  }
  const base = (p.mime || 'application/octet-stream').split(';')[0].trim().toLowerCase()
  const caption = p.caption || undefined
  if (/^image\/(jpeg|png|webp)$/.test(base)) return { image: buffer, caption, mimetype: base }
  if (base === 'video/mp4') return { video: buffer, caption, mimetype: base }
  if (base.startsWith('audio/')) return { audio: buffer, mimetype: base }
  return { document: buffer, mimetype: base, fileName: p.nombre || 'archivo', caption }
}

/** Manda ya. Devuelve el id del mensaje real. */
function enviarPedido(chatId, p, buffer, firmante) {
  const conArchivo = p.tipo !== 'texto'
  return enviar(chatId, contenidoDe(p, buffer), conArchivo ? buffer : undefined, mensajeCitado(chatId, p.citadoId), firmante)
}

function tipoDeArchivo(mime) {
  const base = (mime || '').split(';')[0].toLowerCase()
  if (base.startsWith('image/')) return 'imagen'
  if (base.startsWith('video/')) return 'video'
  if (base.startsWith('audio/')) return 'audio'
  return 'documento'
}

/** Guarda el pedido como borrador "en cola" en el chat. */
async function encolarSalida(chatId, p, buffer) {
  const u = usuarioActual()
  const id = `SAL-${crypto.randomBytes(8).toString('hex').toUpperCase()}`
  const m = {
    id,
    deMi: true,
    ts: ahora(),
    tipo: p.tipo === 'texto' ? 'texto' : p.tipo === 'nota_voz' ? 'nota_voz' : tipoDeArchivo(p.mime),
    texto: p.tipo === 'texto' ? p.texto : p.caption || '',
    origen: 'vivo',
    estado: 'en_cola',
    salida: {
      tipo: p.tipo,
      citadoId: p.citadoId || null,
      menciones: p.menciones || null,
      mime: p.mime || null,
      nombre: p.nombre || null,
      caption: p.caption || null,
      segundos: p.segundos || 0,
      ondas: p.ondas || null,
      intentos: 0,
      error: null,
    },
    ...(p.citadoId ? { citado: p.citadoId } : {}),
    ...(u ? { enviadoPor: { id: u.id, nombre: u.nombre } } : {}),
  }
  if (buffer) {
    const mime = p.tipo === 'nota_voz' ? 'audio/ogg; codecs=opus' : p.mime
    const archivo = `${id}.${extensionDe(mime, p.nombre)}`
    await guardarMedia(chatId, archivo, buffer, mime)
    if (cuota.fraccion() >= cuota.UMBRAL_LIMPIEZA) liberarEspacio()
    m.media = {
      mime,
      nombre: p.nombre || null,
      tamano: buffer.length,
      archivo,
      estado: 'ok',
      ...(p.segundos ? { segundos: p.segundos } : {}),
      ...(p.ondas ? { ondas: p.ondas } : {}),
    }
  }
  if (!existeChat(chatId)) upsertChat(chatId, { ultimoTs: m.ts })
  agregarMensaje(chatId, m)
  log('aviso', 'Mensaje en la bandeja de salida', `${nombreDe(chatId)} · se manda cuando vuelva la conexión`)
  return { id, enCola: true }
}

/** Manda ya si hay conexión; si no (o se corta en el intento), lo deja en la bandeja de salida. */
async function enviarOEncolar(chatId, p, buffer) {
  if (sock && conexion === 'conectado') {
    try {
      return { id: await enviarPedido(chatId, p, buffer) }
    } catch (err) {
      if (!esCorte(err)) throw err
      log('aviso', 'Se cortó al mandar un mensaje', err.message)
    }
  }
  return encolarSalida(chatId, p, buffer)
}

let procesandoSalida = false
/** Manda lo que esté en la bandeja de salida, del más viejo al más nuevo. */
export async function procesarSalida() {
  if (procesandoSalida || !sock || conexion !== 'conectado') return 0
  procesandoSalida = true
  let salieron = 0
  try {
    const cola = []
    recorrerMensajes((chatId, m) => {
      if (m.salida && m.estado === 'en_cola' && (m.salida.intentos || 0) < SALIDA_MAX_INTENTOS) cola.push([chatId, m])
    })
    cola.sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0))
    for (const [chatId, m] of cola) {
      if (!sock || conexion !== 'conectado') break
      const s = m.salida
      try {
        const buffer = m.media?.archivo ? await leerArchivo(claveMedia(chatId, m.media.archivo)) : undefined
        if (m.media?.archivo && !buffer) throw new Error('No se encontró el archivo guardado del mensaje')
        actualizarMensaje(chatId, m.id, { estado: 'enviando' })
        const pedido = { tipo: s.tipo, texto: m.texto, citadoId: s.citadoId, menciones: s.menciones, mime: s.mime, nombre: s.nombre, caption: s.caption, segundos: s.segundos, ondas: s.ondas }
        await enviarPedido(chatId, pedido, buffer, m.enviadoPor || null)
        // Salió: el borrador se reemplaza por el mensaje real (que ya guardó el envío).
        quitarMensaje(chatId, m.id)
        if (m.media?.archivo) borrarArchivo(claveMedia(chatId, m.media.archivo)).catch(() => {})
        salieron++
      } catch (err) {
        if (esCorte(err)) {
          actualizarMensaje(chatId, m.id, { estado: 'en_cola' })
          break
        }
        const intentos = (s.intentos || 0) + 1
        actualizarMensaje(chatId, m.id, {
          estado: intentos >= SALIDA_MAX_INTENTOS ? 'error' : 'en_cola',
          salida: { ...s, intentos, error: err.message },
        })
        log('aviso', 'No se pudo mandar un mensaje de la bandeja de salida', `${nombreDe(chatId)} · ${err.message}`)
      }
    }
  } finally {
    procesandoSalida = false
  }
  if (salieron) log('ok', 'Bandeja de salida', `${salieron} mensajes enviados al volver la conexión`)
  return salieron
}

/** Vuelve a poner en cola un mensaje de la bandeja de salida que dio error. */
export function reintentarSalida(chatId, id) {
  const m = buscarMensaje(chatId, id)
  if (!m?.salida) throw Object.assign(new Error('No es un mensaje de la bandeja de salida'), { status: 404 })
  actualizarMensaje(chatId, id, { estado: 'en_cola', salida: { ...m.salida, intentos: 0, error: null } })
  sinUsuario(() => procesarSalida().catch(() => {}))
  return vistaMensaje(buscarMensaje(chatId, id))
}

/** Descarta un mensaje de la bandeja de salida (no se manda). */
export function descartarSalida(chatId, id) {
  const m = buscarMensaje(chatId, id)
  if (!m?.salida) throw Object.assign(new Error('No es un mensaje de la bandeja de salida'), { status: 404 })
  if (m.estado === 'enviando') throw new Error('Se está mandando en este momento')
  quitarMensaje(chatId, id)
  if (m.media?.archivo) borrarArchivo(claveMedia(chatId, m.media.archivo)).catch(() => {})
  return { ok: true }
}

let salidaPeriodica = false
function arrancarSalidaPeriodica() {
  if (salidaPeriodica) return
  salidaPeriodica = true
  setInterval(() => sinUsuario(() => procesarSalida().catch(() => {})), 60_000).unref()
}

export function enviarTexto(chatId, texto, citadoId, menciones) {
  const limpio = String(texto || '').trim()
  if (!limpio) throw new Error('El mensaje está vacío')
  return enviarOEncolar(chatId, { tipo: 'texto', texto: limpio, citadoId, menciones: mencionesDe(chatId, limpio, menciones) })
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
  return enviarOEncolar(chatId, { tipo: 'archivo', mime: mime || 'application/octet-stream', nombre, caption }, buffer)
}

/** Nota de voz: se convierte a ogg/opus (como las del celular) y lleva su forma de onda real. */
export async function enviarNotaDeVoz(chatId, buffer, segundos) {
  const ogg = await aNotaDeVoz(buffer)
  const ondas = await formaDeOnda(ogg).catch(() => null)
  return enviarOEncolar(chatId, { tipo: 'nota_voz', segundos, ondas }, ogg)
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
