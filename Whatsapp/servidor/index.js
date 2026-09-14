import fs from 'node:fs'
import express from 'express'
import { HOST, PUERTO, WEB_DIR } from './src/config.js'
import { emitir, log, suscribir, ultimosLogs } from './src/eventos.js'
import { config, listarChats, listarMensajes, setConfig, usoAlmacenamiento, vistaMensaje } from './src/almacen.js'
import * as wa from './src/whatsapp.js'
import { rutaFoto } from './src/fotos.js'

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))
app.use(express.static(WEB_DIR))

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
  if (!/^[\w.+-]+@(s\.whatsapp\.net|lid)$/.test(id || '')) throw Object.assign(new Error('Chat inválido'), { status: 400 })
  return id
}

const binario = express.raw({ type: () => true, limit: '64mb' })
function archivoDe(req) {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Error('No llegó ningún archivo')
  return req.body
}

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
app.post('/api/vincular/codigo', ruta(async (req) => ({ codigo: await wa.pedirCodigo(req.body?.telefono) })))
app.post('/api/desvincular', ruta(async () => {
  await wa.desvincular()
  return { ok: true }
}))
app.post('/api/reconectar', ruta(async () => {
  await wa.reconectar()
  return { ok: true }
}))
app.post('/api/sincronizar-chats', ruta(() => wa.sincronizarChats()))

/* Chats y mensajes */
app.get('/api/chats', ruta(() => listarChats()))
app.post('/api/chats', ruta(async (req) => ({ id: await wa.abrirChat(req.body?.telefono) })))
app.get('/api/chats/:id/mensajes', ruta((req) => listarMensajes(chatId(req)).map(vistaMensaje)))
app.post('/api/chats/:id/leido', ruta(async (req) => {
  await wa.confirmarLectura(chatId(req))
  return { ok: true }
}))
app.post('/api/chats/:id/texto', ruta(async (req) => ({ id: await wa.enviarTexto(chatId(req), req.body?.texto, req.body?.citadoId) })))
app.post('/api/chats/:id/reaccion', ruta((req) => wa.enviarReaccion(chatId(req), req.body?.id, req.body?.emoji)))
app.post('/api/chats/:id/presencia', ruta((req) => wa.suscribirPresencia(chatId(req))))
app.get('/api/chats/:id/foto', ruta((req, res) => {
  const archivo = rutaFoto(chatId(req))
  if (!fs.existsSync(archivo)) throw Object.assign(new Error('Sin foto de perfil'), { status: 404 })
  res.set('Cache-Control', 'private, max-age=604800')
  res.sendFile(archivo)
}))
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
  const { ruta: archivo, mime, nombre } = wa.obtenerMedia(chatId(req), req.params.msgId)
  if (mime) res.type(mime.split(';')[0])
  if (req.query.descargar && nombre) res.attachment(nombre)
  res.sendFile(archivo)
}))
app.post('/api/chats/:id/media/:msgId/descargar', ruta((req) => wa.descargarAhora(chatId(req), req.params.msgId)))

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta inexistente' }))

/* Arranque */
const servidor = app.listen(PUERTO, HOST, () => {
  log('ok', `Panel listo en http://localhost:${PUERTO}`)
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

function cerrar() {
  log('info', 'Cerrando el servicio')
  wa.detener()
  servidor.close()
  setTimeout(() => process.exit(0), 600).unref()
}
process.on('SIGINT', cerrar)
process.on('SIGTERM', cerrar)
process.on('unhandledRejection', (err) => log('error', 'Error no controlado', err?.message || String(err)))
