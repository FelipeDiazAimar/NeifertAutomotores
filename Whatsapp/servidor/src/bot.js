/**
 * API del bot de respuestas automáticas (otro programa, en esta misma PC). Habla con el
 * CRM por teléfono, sin chat. La autenticación (WA_BOT_SECRETO + solo desde esta PC) la
 * hace index.js antes de llegar acá. A la auditoría van solo ids y banderas, nunca el
 * texto de los mensajes.
 */
import { Router } from 'express'
import { CRM_CONFIGURADO, asegurarCliente, clientePorTelefono, seguimientoPorTelefono, tareaPorTelefono } from './crm.js'
import { datosNegocio, fotoGrandeVehiculoWeb, fotosDeVehiculoWeb, vehiculosWeb } from './whatsapp.js'
import { buscarChat, listarMensajes } from './almacen.js'
import { estaAbierto } from './negocioBot.js'
import { historialParaBot } from './historialBot.js'
import { normalizarAR } from './telefono.js'
import { guardarCharla } from './sofia.js'
import { guardarReporte } from './sofiaEstado.js'
import { filtrarVehiculos } from './vehiculosFiltro.js'

const FILTROS = ['q', 'marca', 'modelo', 'anioDesde', 'anioHasta', 'kmMax', 'precioMax', 'moneda', 'combustible', 'transmision', 'categoria', 'condicion', 'ordenar', 'nuevo', 'disponibles', 'limite']

export function rutasBot({ ruta, accion }) {
  const r = Router()
  r.get('/salud', ruta(() => ({ ok: true, crm: CRM_CONFIGURADO })))
  // Cada minuto el bot cuenta cómo está (conectado, uso del cupo, charlas abiertas): lo ve el panel en Conexión → Sofía.
  r.post('/estado', ruta((req) => guardarReporte(req.body || {})))
  // `imagen` es una ruta interna del panel: al bot no le sirve.
  // Dirección, horarios, teléfonos y categorías de la página.
  r.get('/negocio', ruta(() => datosNegocio()))
  // ¿Está abierto el salón ese día y a esa hora? (?dia=mañana&hora=10:00). Con la hora de Argentina.
  r.get('/abierto', ruta(async (req) => estaAbierto((await datosNegocio()).horarios, { dia: req.query.dia, hora: req.query.hora })))
  // Lo que se habló con ese teléfono en esta línea y con Sofía, junto y en orden (para que Sofía tenga todo el contexto).
  r.get('/conversacion', ruta((req) => {
    const numero = normalizarAR(req.query.telefono)
    const jid = numero ? `${numero}@s.whatsapp.net` : ''
    return { mensajes: jid && buscarChat(jid) ? historialParaBot(listarMensajes(jid, { conSofia: true }), { limite: Number(req.query.limite) || 30, dias: Number(req.query.dias) || 30 }) : [] }
  }))
  // Sin filtros: la lista entera (como siempre). Con filtros: { total, vehiculos } para que la IA consulte lo que necesita.
  r.get('/vehiculos', ruta(async (req) => {
    const lista = (await vehiculosWeb()).map((v) => ({ ...v, imagen: undefined }))
    return FILTROS.some((f) => req.query[f] !== undefined) ? filtrarVehiculos(lista, req.query) : lista
  }))
  // Las fotos de un auto: { nombre, descripcion, fotos: ['/vehiculos/<id>/foto/0', ...] } (hasta 10, rutas de este mismo API).
  r.get('/vehiculos/:id/fotos', ruta(async (req) => {
    const v = await fotosDeVehiculoWeb(req.params.id)
    if (!v) throw Object.assign(new Error('No existe ese auto'), { status: 404 })
    const fotos = v.fotos.slice(0, 10).map((_, i) => `/vehiculos/${encodeURIComponent(req.params.id)}/foto/${i}`)
    return { nombre: v.nombre, descripcion: v.descripcion, fotos }
  }))
  // Una foto como JPEG (1280 px como mucho), lista para mandar por WhatsApp.
  r.get('/vehiculos/:id/foto/:n', async (req, res) => {
    try {
      const jpg = await fotoGrandeVehiculoWeb(req.params.id, Number(req.params.n))
      if (!jpg) return res.status(404).json({ error: 'No hay esa foto' })
      res.setHeader('Cache-Control', 'private, max-age=600')
      res.type('image/jpeg').send(jpg)
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message })
    }
  })
  r.get('/cliente', ruta(async (req) => ({ cliente: await clientePorTelefono(req.query.telefono) })))
  r.post('/cliente', accion('bot_cliente', (req) => asegurarCliente(req.body || {}, null), (req, res) => ({ cliente: res.cliente.id, creado: res.creado })))
  r.post('/seguimiento', accion('bot_seguimiento', (req) => seguimientoPorTelefono(req.body?.telefono, req.body?.texto, null), (req, res) => ({ cliente: res.clienteId })))
  r.post('/tarea', accion('bot_tarea', (req) => tareaPorTelefono(req.body?.telefono, req.body || {}, null), (req, res) => ({ cliente: res.clienteId, tarea: res.tareaId })))
  r.post('/mensajes', accion('bot_mensajes', (req) => guardarCharla(req.body || {}), (req, res) => ({ chat: res.chatId, nuevos: res.nuevos })))
  return r
}
