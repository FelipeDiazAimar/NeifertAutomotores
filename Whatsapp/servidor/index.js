import express from 'express'
import { HOST, LOGIN_CONFIGURADO, numeroLinea, ORIGENES_CRM, PUERTO, SOLO_ESTA_PC, WEB_DIR } from './src/config.js'
import { agentes, emitir, log, marcarViendo, suscribir, ultimosLogs } from './src/eventos.js'
import { cerrarSesion, exigirCabecera, exigirSesion, iniciarSesion, sesionActual } from './src/auth.js'
import { buscarMensajes, cerrarAlmacen, config, iniciarAlmacen, listarChats, listarMensajes, setConfig, usoAlmacenamiento, vistaMensaje } from './src/almacen.js'
import * as wa from './src/whatsapp.js'
import { claveFoto } from './src/fotos.js'
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

const app = express()
app.disable('x-powered-by')
// Detrás de un proxy: así se sabe si el pedido vino por https (para la cookie).
app.set('trust proxy', true)
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

const binario = express.raw({ type: () => true, limit: '64mb' })
function archivoDe(req) {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Error('No llegó ningún archivo')
  return req.body
}

/* Sesión: lo único de /api que se puede usar sin haber entrado */
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
app.get('/api/estado', ruta(() => ({ ...wa.estadoConexion(), config: config() })))
app.get('/api/log', ruta(() => ultimosLogs()))
app.get('/api/almacenamiento', ruta(() => usoAlmacenamiento()))
app.post('/api/config', ruta((req) => {
  const c = setConfig(req.body || {})
  emitir('config', c)
  return c
}))
app.post('/api/desvincular', ruta(async () => {
  await wa.desvincular()
  return { ok: true }
}))
app.post('/api/reconectar', ruta(async () => {
  await wa.reconectar()
  return { ok: true }
}))
app.post('/api/sincronizar-chats', ruta(() => wa.sincronizarChats()))
app.post('/api/sincronizar-grupos', ruta(() => wa.sincronizarGrupos()))

/* Chats y mensajes */
app.get('/api/chats', ruta(() => listarChats()))
// Búsqueda de texto. Sin `chat` busca en todas las conversaciones.
app.get('/api/buscar', ruta((req) => buscarMensajes(req.query.q, { jid: req.query.chat || null })))
app.post('/api/chats', ruta(async (req) => ({ id: await wa.abrirChat(req.body?.telefono) })))
app.get('/api/chats/:id/mensajes', ruta((req) => listarMensajes(chatId(req)).map(vistaMensaje)))
// Archivar, fijar, silenciar y marcar como no leído. Viaja al celular vía chatModify.
app.get('/api/chats/:id/info', ruta((req) => wa.fichaChat(chatId(req))))
app.post('/api/chats/:id/reenviar', ruta((req) => wa.reenviarMensajes(chatId(req), req.body?.ids, req.body?.destinos)))
app.post('/api/chats/:id/salir', ruta((req) => wa.salirDelGrupo(chatId(req))))
app.post('/api/chats/:id/marca', ruta((req) => wa.cambiarMarca(chatId(req), req.body?.accion, req.body?.valor ?? null)))
app.post('/api/chats/:id/leido', ruta(async (req) => {
  await wa.confirmarLectura(chatId(req))
  return { ok: true }
}))
app.post('/api/chats/:id/texto', ruta(async (req) => ({ id: await wa.enviarTexto(chatId(req), req.body?.texto, req.body?.citadoId) })))
app.post('/api/chats/:id/reaccion', ruta((req) => wa.enviarReaccion(chatId(req), req.body?.id, req.body?.emoji)))
app.post('/api/chats/:id/eliminar', ruta((req) => wa.eliminarMensaje(chatId(req), req.body?.id)))
app.post('/api/chats/:id/destacar', ruta((req) => wa.destacarMensaje(chatId(req), req.body?.id, req.body?.destacar)))
app.post('/api/chats/:id/presencia', ruta((req) => wa.suscribirPresencia(chatId(req))))
app.get('/api/chats/:id/foto', ruta((req, res) =>
  servir(req, res, claveFoto(chatId(req)), { mime: 'image/jpeg', cache: 'private, max-age=604800', faltante: 'Sin foto de perfil' }),
))
app.post('/api/chats/:id/archivo', binario, ruta(async (req) => ({
  id: await wa.enviarArchivo(chatId(req), archivoDe(req), {
    mime: req.get('content-type'),
    nombre: req.query.nombre,
    caption: req.query.texto,
  }),
})))
app.post('/api/chats/:id/nota-voz', binario, ruta(async (req) => ({
  id: await wa.enviarNotaDeVoz(chatId(req), archivoDe(req), Number(req.query.segundos) || 0),
})))
// Sirve solo archivos ya descargados; nunca dispara una descarga (evita reintentos en loop desde la pantalla).
app.get('/api/chats/:id/media/:msgId', ruta((req, res) => {
  const { clave, mime, nombre } = wa.obtenerMedia(chatId(req), req.params.msgId)
  return servir(req, res, clave, { mime, nombre, descargar: !!req.query.descargar })
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
  if (!LOGIN_CONFIGURADO) log('aviso', 'Login con el CRM sin configurar', 'Solo se puede usar desde esta PC')
  log('info', 'Archivos (fotos, audios, videos, documentos)', DONDE)
  if (numeroLinea()) log('info', 'Solo se acepta el número de la concesionaria', `+${numeroLinea()}`)
  else log('aviso', 'WHATSAPP_NUMERO sin definir', 'Cualquiera que escanee el QR vincula su número')
  wa.iniciar().catch((err) => log('error', 'No se pudo iniciar WhatsApp', err.message))
})

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
process.on('unhandledRejection', (err) => log('error', 'Error no controlado', err?.message || String(err)))
