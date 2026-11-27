/**
 * API del bot de respuestas automáticas (otro programa, en esta misma PC). Habla con el
 * CRM por teléfono, sin chat. La autenticación (WA_BOT_SECRETO + solo desde esta PC) la
 * hace index.js antes de llegar acá. A la auditoría van solo ids y banderas, nunca el
 * texto de los mensajes.
 */
import { Router } from 'express'
import { CRM_CONFIGURADO, asegurarCliente, clientePorTelefono, seguimientoPorTelefono, tareaPorTelefono } from './crm.js'
import { datosNegocio, vehiculosWeb } from './whatsapp.js'
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
  // Sin filtros: la lista entera (como siempre). Con filtros: { total, vehiculos } para que la IA consulte lo que necesita.
  r.get('/vehiculos', ruta(async (req) => {
    const lista = (await vehiculosWeb()).map((v) => ({ ...v, imagen: undefined }))
    return FILTROS.some((f) => req.query[f] !== undefined) ? filtrarVehiculos(lista, req.query) : lista
  }))
  r.get('/cliente', ruta(async (req) => ({ cliente: await clientePorTelefono(req.query.telefono) })))
  r.post('/cliente', accion('bot_cliente', (req) => asegurarCliente(req.body || {}, null), (req, res) => ({ cliente: res.cliente.id, creado: res.creado })))
  r.post('/seguimiento', accion('bot_seguimiento', (req) => seguimientoPorTelefono(req.body?.telefono, req.body?.texto, null), (req, res) => ({ cliente: res.clienteId })))
  r.post('/tarea', accion('bot_tarea', (req) => tareaPorTelefono(req.body?.telefono, req.body || {}, null), (req, res) => ({ cliente: res.clienteId, tarea: res.tareaId })))
  r.post('/mensajes', accion('bot_mensajes', (req) => guardarCharla(req.body || {}), (req, res) => ({ chat: res.chatId, nuevos: res.nuevos })))
  return r
}
