/**
 * API del bot de respuestas automáticas (otro programa, en esta misma PC). Habla con el
 * CRM por teléfono, sin chat. La autenticación (WA_BOT_SECRETO + solo desde esta PC) la
 * hace index.js antes de llegar acá. A la auditoría van solo ids y banderas, nunca el
 * texto de los mensajes.
 */
import { Router } from 'express'
import { CRM_CONFIGURADO, asegurarCliente, clientePorTelefono, seguimientoPorTelefono, tareaPorTelefono } from './crm.js'
import { vehiculosWeb } from './whatsapp.js'

export function rutasBot({ ruta, accion }) {
  const r = Router()
  r.get('/salud', ruta(() => ({ ok: true, crm: CRM_CONFIGURADO })))
  // `imagen` es una ruta interna del panel: al bot no le sirve.
  r.get('/vehiculos', ruta(async () => (await vehiculosWeb()).map((v) => ({ ...v, imagen: undefined }))))
  r.get('/cliente', ruta(async (req) => ({ cliente: await clientePorTelefono(req.query.telefono) })))
  r.post('/cliente', accion('bot_cliente', (req) => asegurarCliente(req.body || {}, null), (req, res) => ({ cliente: res.cliente.id, creado: res.creado })))
  r.post('/seguimiento', accion('bot_seguimiento', (req) => seguimientoPorTelefono(req.body?.telefono, req.body?.texto, null), (req, res) => ({ cliente: res.clienteId })))
  r.post('/tarea', accion('bot_tarea', (req) => tareaPorTelefono(req.body?.telefono, req.body || {}, null), (req, res) => ({ cliente: res.clienteId, tarea: res.tareaId })))
  return r
}
