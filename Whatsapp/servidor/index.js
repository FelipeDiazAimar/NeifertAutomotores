import express from 'express'
import {
  CONSERVAR_EDICIONES,
  CONSERVAR_ELIMINADOS,
  DETRAS_DE_PROXY,
  HOST,
  LOGIN_CONFIGURADO,
  MEDIA_MAX_BYTES,
  MEDIA_MAX_MB,
  numeroLinea,
  ORIGENES_CRM,
  VENTANA_DIAS,
  PUERTO,
  SOLO_ESTA_PC,
  WEB_DIR,
} from './src/config.js'
import { agentes, emitir, log, marcarViendo, suscribir, ultimosLogs } from './src/eventos.js'
import { cerrarSesion, exigirCabecera, exigirEscritura, exigirLinea, exigirSesion, iniciarSesion, sesionActual } from './src/auth.js'
import { auditar, ultimasAcciones } from './src/auditoria.js'
import { buscarMensaje, buscarMensajes, cerrarAlmacen, config, iniciarAlmacen, listarChats, organizarCarpetas, paginaDeMensajes, setConfig, usoAlmacenamiento, vistaMensaje } from './src/almacen.js'
import * as wa from './src/whatsapp.js'
import * as crm from './src/crm.js'
import { claveFoto, recuperarFoto } from './src/fotos.js'
import { DONDE, servir } from './src/archivos.js'

// Freno de seguridad: accesible desde otras PC o desde internet, sin login cualquiera
// podría escribir con el número de la concesionaria. En ese caso no se arranca.
if (!SOLO_ESTA_PC && !LOGIN_CONFIGURADO) {
  console.error(
    `HOST=${HOST} deja el panel abierto a otras computadoras, pero el login con el CRM no está configurado.
` +
      'Definí SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY (ver Whatsapp/docs/SERVIDOR.md), o volvé a HOST=127.0.0.1.',
  )
  process.exit(1)
}

const INICIO = Date.now()
const app = express()
app.disable('x-powered-by')
// Solo detrás de un proxy (Cloudflare Tunnel, nginx) se cree lo que el proxy informa
// sobre https y la IP. Sin proxy, cualquiera podría inventarse esas cabeceras.
app.set('trust proxy', DETRAS_DE_PROXY)
app.use(express.json({ limit: '1mb' }))
// El panel solo se puede mostrar embebido dentro del CRM, nunca en una página ajena.
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${ORIGENES_CRM.join(' ')}`.trim())
  next()
})
app.use(express.static(WEB_DIR))
app.use('/api', exigirCabecera)

/** Envuelve un handler: devuelve JSON con lo que retorna, o { error } con el mensaje. */
const ruta = (fn) => async (req, res) => {
  try {
    const resultado = await fn(req, res)
    if (resultado !== undefined && !res.headersSent) res.json(resultado)
  } catch (err) {
    if (!res.headersSent) res.status(err.status || 400).json({ error: err.message })
  }
}

function chatId(req) {
  const id = req.params.id
  if (!/^[\w.+-]+@(s\.whatsapp\.net|lid|g\.us)$/.test(id || '')) throw Object.assign(new Error('Chat inválido'), { status: 400 })
  return id
}

/**
 * Una acción que cambia algo: además de responder, queda en la auditoría (quién, qué,
 * cuándo, en qué chat, desde qué IP). `detalle` arma lo que vale la pena guardar, nunca
 * el contenido de los mensajes.
 */
const accion = (nombre, fn, detalle = () => ({})) =>
  ruta(async (req, res) => {
    const id = req.params.id ? chatId(req) : null
    try {
      const r = await fn(req, res)
      auditar({ req, accion: nombre, chatId: id, detalle: detalle(req, r) || {} })
      return r
    } catch (err) {
      auditar({ req, accion: nombre, resultado: 'error', chatId: id, detalle: { error: err.message } })
      throw err
    }
  })

const binario = express.raw({ type: () => true, limit: MEDIA_MAX_BYTES })
function archivoDe(req) {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Error('No llegó ningún archivo')
  return req.body
}

/* Público: lo único de /api que responde sin haber entrado */

// Para el monitoreo (Task Scheduler, un vigía externo): si el servicio está vivo y la
// línea conectada. No da datos de la cuenta.
app.get('/api/salud', (req, res) => {
  const { conexion, desde } = wa.estadoConexion(null)
  res.status(conexion === 'conectado' ? 200 : 503).json({
    ok: conexion === 'conectado',
    conexion,
    desdeSeg: Math.round((Date.now() - desde) / 1000),
    activoSeg: Math.round((Date.now() - INICIO) / 1000),
  })
})
// Desde qué sitios puede llegar la sesión del CRM (el panel embebido solo acepta esos).
app.get('/api/publico', (req, res) => res.json({ origenesCrm: ORIGENES_CRM }))
app.post('/api/sesion', iniciarSesion)
app.post('/api/sesion/salir', cerrarSesion)

// Todo lo demás exige haber entrado desde el CRM.
app.use('/api', exigirSesion)
app.get('/api/sesion', ruta((req) => sesionActual(req)))

/* Quién más está usando el panel */
app.get('/api/agentes', ruta(() => agentes()))
app.post('/api/viendo', ruta((req) => marcarViendo(req.body?.pestana, req.body?.chatId || null)))

/* Estado y conexión */
app.get('/api/eventos', (req, res) => suscribir(req, res))
// Lo que el panel necesita saber de la configuración del servidor (límite de archivos y
// la definición de privacidad: si se conservan los eliminados y las ediciones).
const configPublica = () => ({ ...config(), mediaMaxMb: MEDIA_MAX_MB, conservarEliminados: CONSERVAR_ELIMINADOS, conservarEdiciones: CONSERVAR_EDICIONES, ventanaDias: VENTANA_DIAS, crm: crm.CRM_CONFIGURADO })
app.get('/api/estado', ruta((req) => ({ ...wa.estadoConexion(req.usuario), config: configPublica() })))
app.get('/api/log', ruta(() => ultimosLogs()))
app.get('/api/auditoria', exigirLinea, ruta((req) => ultimasAcciones(Math.min(Number(req.query.limite) || 100, 500))))
app.get('/api/almacenamiento', ruta(() => usoAlmacenamiento()))
app.post('/api/config', exigirLinea, accion('preferencias', (req) => {
  setConfig(req.body || {})
  const c = configPublica()
  emitir('config', c)
  return c
}, (req) => ({ cambios: req.body })))
app.post('/api/desvincular', exigirLinea, accion('desvincular', async () => {
  await wa.desvincular()
  return { ok: true }
}))
app.post('/api/reconectar', exigirLinea, accion('reconectar', async () => {
  await wa.reconectar()
  return { ok: true }
}))
app.post('/api/sincronizar-chats', exigirEscritura, accion('sincronizar_chats', () => wa.sincronizarChats()))
app.post('/api/sincronizar-grupos', exigirEscritura, accion('sincronizar_grupos', () => wa.sincronizarGrupos()))

/* Chats y mensajes */
app.get('/api/chats', ruta(() => listarChats()))
// Búsqueda de texto. Sin `chat` busca en todas las conversaciones.
app.get('/api/buscar', ruta((req) => buscarMensajes(req.query.q, { jid: req.query.chat || null, desde: req.query.desde, limite: req.query.limite })))
app.post('/api/chats', exigirEscritura, accion('abrir_chat', async (req) => ({ id: await wa.abrirChat(req.body?.telefono) }), (req, r) => ({ chat: r.id })))
// Por páginas: los últimos `limite` (400), o los anteriores al mensaje `antes`.
app.get('/api/chats/:id/mensajes', ruta((req) => paginaDeMensajes(chatId(req), { limite: req.query.limite, antes: req.query.antes || null })))
// Un mensaje suelto (por ejemplo, el citado en una respuesta que no está en la página).
app.get('/api/chats/:id/mensajes/:msgId', ruta((req) => {
  const m = buscarMensaje(chatId(req), req.params.msgId)
  if (!m) throw Object.assign(new Error('El mensaje no está guardado'), { status: 404 })
  return vistaMensaje(m)
}))
// Archivar, fijar, silenciar y marcar como no leído. Viaja al celular vía chatModify.
app.get('/api/chats/:id/info', ruta((req) => wa.fichaChat(chatId(req))))
app.post('/api/chats/:id/reenviar', exigirEscritura, accion('reenviar', (req) => wa.reenviarMensajes(chatId(req), req.body?.ids, req.body?.destinos), (req) => ({ mensajes: req.body?.ids?.length || 0, destinos: req.body?.destinos })))
app.post('/api/chats/:id/salir', exigirLinea, accion('salir_grupo', (req) => wa.salirDelGrupo(chatId(req))))
// Borra el chat del respaldo (mensajes, archivos en R2, foto). En el celular sigue estando.
app.post('/api/chats/:id/borrar', exigirLinea, accion('borrar_chat', (req) => wa.borrarChat(chatId(req)), (req, r) => r))
app.post('/api/chats/:id/marca', exigirEscritura, accion('marca', (req) => wa.cambiarMarca(chatId(req), req.body?.accion, req.body?.valor ?? null), (req) => ({ marca: req.body?.accion, valor: req.body?.valor ?? null })))
app.post('/api/chats/:id/leido', exigirEscritura, ruta(async (req) => {
  await wa.confirmarLectura(chatId(req))
  return { ok: true }
}))
// Los envíos devuelven { id, enCola }: sin conexión el mensaje queda en la bandeja de salida.
app.post('/api/chats/:id/texto', exigirEscritura, accion('enviar_texto', (req) => wa.enviarTexto(chatId(req), req.body?.texto, req.body?.citadoId, req.body?.menciones), (req, r) => ({ mensaje: r.id, enCola: !!r.enCola, largo: String(req.body?.texto || '').length })))
app.post('/api/chats/:id/salida/:msgId/reintentar', exigirEscritura, accion('reintentar_envio', (req) => wa.reintentarSalida(chatId(req), req.params.msgId), (req) => ({ mensaje: req.params.msgId })))
app.post('/api/chats/:id/salida/:msgId/descartar', exigirEscritura, accion('descartar_envio', (req) => wa.descartarSalida(chatId(req), req.params.msgId), (req) => ({ mensaje: req.params.msgId })))
// Integrantes de un grupo, para el "@" del cuadro de texto.
// CRM: de qué cliente es el chat y acciones que quedan en el CRM a nombre de quien las hace.
app.get('/api/crm/clientes', ruta((req) => crm.buscarClientes(req.query.q)))
app.get('/api/crm/usuarios', ruta(() => crm.usuariosCrm()))
app.get('/api/chats/:id/crm', ruta((req) => crm.fichaCrm(chatId(req))))
app.post('/api/chats/:id/crm/vincular', exigirEscritura, accion('crm_vincular', (req) => crm.vincularCliente(chatId(req), req.body?.clienteId || null), (req) => ({ cliente: req.body?.clienteId || null })))
app.post('/api/chats/:id/crm/cliente', exigirEscritura, accion('crm_crear_cliente', (req) => crm.crearCliente(chatId(req), req.body || {}, req.usuario), (req, r) => ({ cliente: r.cliente?.id })))
app.post('/api/chats/:id/crm/seguimiento', exigirEscritura, accion('crm_seguimiento', (req) => crm.registrarSeguimiento(chatId(req), req.body?.texto, req.usuario), (req, r) => ({ cliente: r.clienteId })))
app.post('/api/chats/:id/crm/tarea', exigirEscritura, accion('crm_tarea', (req) => crm.crearTarea(chatId(req), req.body || {}, req.usuario), (req, r) => ({ cliente: r.clienteId, tarea: r.tareaId })))

app.get('/api/chats/:id/integrantes',ruta((req) => wa.integrantesDe(chatId(req))))
app.post('/api/chats/:id/reaccion', exigirEscritura, accion('reaccion', (req) => wa.enviarReaccion(chatId(req), req.body?.id, req.body?.emoji), (req) => ({ mensaje: req.body?.id })))
app.post('/api/chats/:id/eliminar', exigirEscritura, accion('eliminar_mensaje', (req) => wa.eliminarMensaje(chatId(req), req.body?.id), (req) => ({ mensaje: req.body?.id })))
app.post('/api/chats/:id/destacar', exigirEscritura, accion('destacar', (req) => wa.destacarMensaje(chatId(req), req.body?.id, req.body?.destacar), (req) => ({ mensaje: req.body?.id })))
app.post('/api/chats/:id/presencia', ruta((req) => wa.suscribirPresencia(chatId(req))))
app.get('/api/chats/:id/foto', ruta(async (req, res) => {
  const jid = chatId(req)
  try {
    await servir(req, res, claveFoto(jid), { mime: 'image/jpeg', cache: 'private, max-age=604800', faltante: 'Sin foto de perfil' })
  } catch (err) {
    // Figura como guardada pero no está: se vuelve a bajar y la pantalla la actualiza sola.
    if (err.status === 404) recuperarFoto(jid)
    throw err
  }
}))
app.post('/api/chats/:id/archivo', exigirEscritura, binario, accion('enviar_archivo', (req) => wa.enviarArchivo(chatId(req), archivoDe(req), {
  mime: req.get('content-type'),
  nombre: req.query.nombre,
  caption: req.query.texto,
}), (req, r) => ({ mensaje: r.id, enCola: !!r.enCola, tipo: req.get('content-type'), bytes: req.body?.length || 0 })))
app.post('/api/chats/:id/nota-voz', exigirEscritura, binario, accion('enviar_nota_voz', (req) =>
  wa.enviarNotaDeVoz(chatId(req), archivoDe(req), Number(req.query.segundos) || 0),
(req, r) => ({ mensaje: r.id, enCola: !!r.enCola, segundos: Number(req.query.segundos) || 0 })))
// Vista previa liviana de fotos y videos (480 px, o la que trae el mensaje si todavía no se bajó).
app.get('/api/chats/:id/media/:msgId/miniatura', ruta(async (req, res) => {
  const jpg = await wa.obtenerMiniatura(chatId(req), req.params.msgId)
  if (!jpg) throw Object.assign(new Error('Sin miniatura'), { status: 404 })
  res.set('Cache-Control', 'private, max-age=86400').type('image/jpeg').send(jpg)
}))
// Sirve solo archivos ya descargados; nunca dispara una descarga (evita reintentos en loop desde la pantalla).
app.get('/api/chats/:id/media/:msgId', ruta(async (req, res) => {
  const { clave, mime, nombre } = wa.obtenerMedia(chatId(req), req.params.msgId)
  try {
    await servir(req, res, clave, { mime, nombre, descargar: !!req.query.descargar })
  } catch (err) {
    // El mensaje decía que estaba guardado y no está: vuelve a "sin descargar" para poder bajarlo de nuevo.
    if (err.status === 404) wa.archivoPerdido(chatId(req), req.params.msgId)
    throw err
  }
}))
app.post('/api/chats/:id/descargar-todo', ruta((req) => wa.descargarTodo(chatId(req), { reintentar: !!req.body?.reintentar })))
app.post('/api/chats/:id/media/:msgId/descargar', ruta((req) => wa.descargarAhora(chatId(req), req.params.msgId)))

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta inexistente' }))

/* Arranque: primero el almacén (en modo supabase trae todo de la base), después el panel y WhatsApp. */
let almacen
try {
  almacen = await iniciarAlmacen()
} catch (err) {
  console.error(`No se pudo cargar el almacén desde Supabase: ${err.message}`)
  console.error('Revisá WA_DATABASE_URL en Whatsapp/servidor/.env, o arrancá con ALMACEN=local para trabajar con archivos.')
  process.exit(1)
}

const servidor = app.listen(PUERTO, HOST, () => {
  log('ok', `Panel listo en http://localhost:${PUERTO}`, SOLO_ESTA_PC ? 'solo desde esta PC' : `abierto en ${HOST} con login del CRM`)
  log(
    'info',
    almacen.modo === 'supabase' ? 'Mensajes guardados en Supabase' : 'Mensajes guardados en archivos locales (modo prueba)',
    almacen.modo === 'supabase' ? `${almacen.chats} chats · ${almacen.mensajes} mensajes cargados` : `${almacen.chats} chats`,
  )
  if (almacen.recuperadas) log('aviso', 'Se recuperó lo que había quedado sin guardar', `${almacen.recuperadas} cambios del diario local (el servicio se había cortado)`)
  if (!LOGIN_CONFIGURADO) log('aviso', 'Login con el CRM sin configurar', 'Solo se puede usar desde esta PC')
  log('info', 'Archivos (fotos, audios, videos, documentos)', DONDE)
  if (numeroLinea()) log('info', 'Solo se acepta el número de la concesionaria', `+${numeroLinea()}`)
  else log('aviso', 'WHATSAPP_NUMERO sin definir', 'Cualquiera que escanee el QR vincula su número')
  // Primero las carpetas de archivos al formato con nombre: así nada nuevo cae en una vieja.
  organizarCarpetas()
    .then((n) => n && log('ok', 'Carpetas de archivos con el nombre del contacto', `${n} renombradas`))
    .catch((err) => log('aviso', 'No se pudieron renombrar las carpetas de archivos', err.message))
    // Lo que se haya guardado de mensajes "para ver una vez" se borra.
    .then(() => wa.limpiarUnaVez())
    .then((n) => n && log('ok', 'Mensajes para ver una vez', `${n} archivos borrados; queda solo el aviso en el chat`))
    .catch((err) => log('aviso', 'No se pudieron borrar los mensajes para ver una vez', err.message))
    .then(() => limpiarVentana())
    .finally(() => wa.iniciar().catch((err) => log('error', 'No se pudo iniciar WhatsApp', err.message)))
  // Y después, una vez por día.
  setInterval(limpiarVentana, 24 * 3600 * 1000)
})

/**
 * Limpieza diaria: lo que quedó fuera de la ventana de días (mensajes, archivos y chats
 * vacíos) y después la conciliación de R2 (archivos que ya no usa ningún mensaje).
 */
async function limpiarVentana() {
  try {
    const r = await wa.purgarVentana()
    if (r.mensajes || r.chats) {
      log('ok', `Limpieza de lo anterior a ${VENTANA_DIAS} días`, `${r.mensajes} mensajes · ${r.archivos} archivos · ${r.chats} chats vacíos`)
    }
  } catch (err) {
    log('aviso', 'No se pudo hacer la limpieza diaria', err.message)
  }
  try {
    const c = await wa.reconciliarArchivos()
    if (c.borrados) log('ok', 'Archivos huérfanos borrados de R2', `${c.borrados} archivos · ${Math.round(c.bytes / 1024)} KB`)
  } catch (err) {
    log('aviso', 'No se pudo conciliar los archivos de R2', err.message)
  }
}

servidor.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`El puerto ${PUERTO} está ocupado: probablemente ya hay otro servicio abierto. Cerralo, o usá otro puerto (PUERTO=3101).`)
  } else {
    console.error(err)
  }
  process.exit(1)
})

let cerrando = false
async function cerrar() {
  if (cerrando) return
  cerrando = true
  log('info', 'Cerrando el servicio')
  wa.detener()
  servidor.close()
  // Lo que falta guardar en Supabase se escribe antes de salir (con un tope de 8 s).
  await Promise.race([cerrarAlmacen(), new Promise((r) => setTimeout(r, 8000))]).catch(() => {})
  process.exit(0)
}
process.on('SIGINT', cerrar)
process.on('SIGTERM', cerrar)
// La app de escritorio (Whatsapp/escritorio) corre el servidor como proceso hijo; en
// Windows no hay SIGTERM entre procesos, así que pide el cierre por este canal.
process.on('message', (m) => m?.tipo === 'cerrar' && cerrar())
// Si la app se cerró de golpe, el servidor no queda huérfano ocupando el puerto.
process.on('disconnect', cerrar)
process.on('unhandledRejection', (err) => log('error', 'Error no controlado', err?.message || String(err)))
