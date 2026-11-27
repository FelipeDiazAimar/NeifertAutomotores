/**
 * Integración con el CRM (A-04): de qué cliente es cada chat, y acciones que dejan rastro
 * en el CRM sin salir del WhatsApp (crear el cliente, registrar un seguimiento, crear una
 * tarea).
 *
 * Habla con la API REST del Supabase del CRM con la clave de servicio, la misma que usa
 * el login. Todo lo que se escribe queda a nombre del usuario del CRM que lo hizo
 * (creado_por / usuario_id), igual que si lo hubiera cargado desde el CRM.
 *
 * Vínculo chat ↔ cliente:
 *   1. Manual: alguien lo eligió desde el panel. Se guarda en el chat (clienteId) y manda.
 *   2. Automático: el teléfono del chat coincide con el de un cliente. Los teléfonos del
 *      CRM están cargados a mano ("3406 51-8585", "+54 9 3406...", "0340615518585"), así
 *      que se comparan normalizados (ver telefono.js).
 */
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from './config.js'
import { buscarChat, esGrupo, nombreDe, pnDeLid, telefonoDe, upsertChat } from './almacen.js'
import { normalizarAR } from './telefono.js'
import { telefonoEmpleado } from './alertas.js'

export const CRM_CONFIGURADO = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
const CACHE_MS = 2 * 60 * 1000
const NINGUNO = 'ninguno'
const CAMPOS = 'id,nombre,telefono,localidad,status,canal,archivado_en'

const error = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status })

export async function rest(ruta, { metodo = 'GET', cuerpo } = {}) {
  if (!CRM_CONFIGURADO) throw error('El CRM no está configurado en el servidor (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).', 503)
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Accept-Profile': 'crm',
  }
  if (cuerpo) Object.assign(headers, { 'Content-Type': 'application/json', 'Content-Profile': 'crm', Prefer: 'return=representation' })
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, {
    method: metodo,
    headers,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const texto = await res.text().catch(() => '')
    throw error(`El CRM respondió ${res.status}${texto ? `: ${texto.slice(0, 200)}` : ''}`, 502)
  }
  return res.status === 204 ? null : res.json()
}

/* ---------------- Clientes (en memoria, se refrescan cada 2 min) ---------------- */

let cache = { ts: 0, porId: new Map(), porTelefono: new Map(), cargando: null }

async function clientes() {
  if (Date.now() - cache.ts < CACHE_MS) return cache
  if (cache.cargando) return cache.cargando
  cache.cargando = (async () => {
    const todos = []
    // De a 1000 (el máximo que entrega la API por pedido).
    for (let desde = 0; ; desde += 1000) {
      const pagina = await rest(`clientes?select=${CAMPOS}&order=creado_en.asc&offset=${desde}&limit=1000`)
      todos.push(...pagina)
      if (pagina.length < 1000) break
    }
    const porId = new Map()
    const porTelefono = new Map()
    for (const c of todos) {
      porId.set(c.id, c)
      const tel = normalizarAR(c.telefono)
      if (!tel) continue
      // Si dos clientes comparten número gana el que no está archivado (y entre ellos, el último).
      const previo = porTelefono.get(tel)
      if (!previo || !c.archivado_en || previo.archivado_en) porTelefono.set(tel, c)
    }
    cache = { ts: Date.now(), porId, porTelefono, cargando: null }
    return cache
  })().catch((err) => {
    cache.cargando = null
    throw err
  })
  return cache.cargando
}

const olvidarCache = () => {
  cache.ts = 0
}

/** Teléfono de un chat individual (también si el chat es de un @lid ya traducido). */
function telefonoDelChat(jid) {
  if (esGrupo(jid)) return null
  if (jid.endsWith('@lid')) {
    const pn = pnDeLid(jid)
    return pn ? telefonoDe(pn) : null
  }
  return telefonoDe(jid)
}

const vistaCliente = (c) =>
  c && { id: c.id, nombre: c.nombre, telefono: c.telefono, localidad: c.localidad, status: c.status, archivado: !!c.archivado_en }

/**
 * GET /api/chats/:id/crm: el cliente del chat (o null) y cómo se vinculó.
 * { configurado, telefono, cliente, vinculo: 'manual' | 'telefono' | null }
 */
export async function fichaCrm(jid) {
  if (esGrupo(jid)) return { configurado: CRM_CONFIGURADO, grupo: true, cliente: null, vinculo: null }
  const telefono = telefonoDelChat(jid)
  if (!CRM_CONFIGURADO) return { configurado: false, telefono, cliente: null, vinculo: null }
  const { porId, porTelefono } = await clientes()
  const manual = buscarChat(jid)?.clienteId
  // 'ninguno': alguien marcó que el número coincide con un cliente que no es esta persona.
  if (manual === NINGUNO) return { configurado: true, telefono, cliente: null, vinculo: 'ninguno' }
  if (manual && porId.has(manual)) return { configurado: true, telefono, cliente: vistaCliente(porId.get(manual)), vinculo: 'manual' }
  const auto = porTelefono.get(normalizarAR(telefono))
  return { configurado: true, telefono, cliente: vistaCliente(auto) || null, vinculo: auto ? 'telefono' : null }
}

/** Clientes para elegir a mano (nombre o teléfono). */
export async function buscarClientes(q) {
  const texto = String(q || '').trim().toLowerCase()
  if (texto.length < 2) return []
  const digitos = texto.replace(/\D/g, '')
  const { porId } = await clientes()
  const res = []
  for (const c of porId.values()) {
    const tel = String(c.telefono || '').replace(/\D/g, '')
    if (c.nombre?.toLowerCase().includes(texto) || (digitos.length >= 4 && tel.includes(digitos))) res.push(vistaCliente(c))
    if (res.length >= 20) break
  }
  return res
}

/**
 * Vincula el chat a un cliente a mano. null vuelve a reconocerlo por el teléfono;
 * 'ninguno' dice que no es cliente aunque el número coincida con uno.
 */
export async function vincularCliente(jid, clienteId) {
  if (esGrupo(jid)) throw error('Un grupo no se vincula a un cliente.')
  if (clienteId && clienteId !== NINGUNO) {
    const { porId } = await clientes()
    if (!porId.has(clienteId)) throw error('Ese cliente no existe en el CRM.', 404)
  }
  upsertChat(jid, { clienteId: clienteId || null })
  return fichaCrm(jid)
}

async function evento(usuario, clienteId, tipo, datos) {
  await rest('eventos', {
    metodo: 'POST',
    cuerpo: { entidad: 'cliente', entidad_id: clienteId, tipo, datos, usuario_id: usuario?.id || null },
  })
}

/** Como se cargan en el CRM: los 10 dígitos (código de área + número), sin +54 9. */
const telefonoParaCrm = (normal, crudo) => (/^549\d{10}$/.test(normal) ? normal.slice(3) : crudo)

/** Alta del cliente en el CRM + evento 'alta'. Devuelve la fila creada. */
async function altaCliente({ nombre, telefono, localidad, notas }, usuario, origen) {
  const fila = {
    nombre,
    telefono,
    localidad: String(localidad || '').trim() || null,
    notas: String(notas || '').trim() || null,
    canal: 'whatsapp',
    status: 'activo',
    creado_por: usuario?.id || null,
    editado_por: usuario?.id || null,
  }
  const [cliente] = await rest('clientes', { metodo: 'POST', cuerpo: fila })
  await evento(usuario, cliente.id, 'alta', { origen }).catch(() => {})
  olvidarCache()
  return cliente
}

/** Crea el cliente con el teléfono y nombre del chat, y lo deja vinculado. */
export async function crearCliente(jid, { nombre, localidad, notas } = {}, usuario) {
  if (esGrupo(jid)) throw error('Un grupo no se puede cargar como cliente.')
  const ficha = await fichaCrm(jid)
  if (ficha.cliente) throw error(`Este chat ya es de ${ficha.cliente.nombre}.`, 409)
  const cliente = await altaCliente(
    { nombre: String(nombre || '').trim() || nombreDe(jid), telefono: telefonoParaCrm(normalizarAR(ficha.telefono), ficha.telefono), localidad, notas },
    usuario,
    'whatsapp',
  )
  upsertChat(jid, { clienteId: cliente.id })
  return fichaCrm(jid)
}

async function clienteDelChat(jid) {
  const ficha = await fichaCrm(jid)
  if (!ficha.cliente) throw error('Este chat no está vinculado a un cliente del CRM.', 409)
  return ficha.cliente
}

/**
 * A quién va una tarea o una alerta de este chat. Si es cliente del CRM, queda de ese cliente. Si no
 * lo es (un proveedor, alguien que recién escribe, un grupo), igual se puede crear: queda sin cliente
 * y el detalle dice de qué contacto de WhatsApp es. No se crea ningún cliente. Devuelve
 * { cliente, contacto }: `contacto` es esa línea de detalle (null si es cliente).
 */
async function destinoDeTarea(jid) {
  const ficha = await fichaCrm(jid)
  if (ficha.cliente) return { cliente: ficha.cliente, contacto: null }
  if (!ficha.configurado) throw error('El CRM no está configurado.', 503)
  const nombre = nombreDe(jid)
  if (ficha.grupo) return { cliente: null, contacto: `Grupo de WhatsApp: ${nombre}` }
  const telefono = ficha.telefono || ''
  const soloNumero = !nombre || nombre.replace(/\D/g, '') === telefono.replace(/\D/g, '')
  const quien = soloNumero ? telefono : `${nombre}${telefono ? ` · ${telefono}` : ''}`
  return { cliente: null, contacto: `Contacto de WhatsApp (no es cliente): ${quien}` }
}

/** El detalle de la tarea o alerta, con la línea del contacto arriba cuando no hay cliente. */
const detalleConContacto = (descripcion, contacto) => [contacto, String(descripcion || '').trim()].filter(Boolean).join('\n') || null

const textoSeguimiento = (texto) => {
  const limpio = String(texto || '').trim()
  if (!limpio) throw error('Escribí qué se habló.')
  return limpio.slice(0, 2000)
}

async function seguimientoDe(cliente, texto, usuario, via) {
  await evento(usuario, cliente.id, 'contacto', { texto, via })
  return { ok: true, clienteId: cliente.id }
}

/** Seguimiento en la bitácora del cliente (lo mismo que "Agregar contacto" en el CRM). */
export async function registrarSeguimiento(jid, texto, usuario) {
  const limpio = textoSeguimiento(texto)
  return seguimientoDe(await clienteDelChat(jid), limpio, usuario, 'whatsapp')
}

const validarTarea = ({ titulo, fecha }) => {
  if (!String(titulo || '').trim()) throw error('La tarea necesita un título.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) throw error('Elegí la fecha de la tarea.')
}

async function tareaDe(cliente, { titulo, descripcion, fecha, hora, prioridad, asignadoA }, usuario, datosEvento = {}, contacto = null) {
  const fila = {
    titulo: String(titulo).trim().slice(0, 200),
    descripcion: detalleConContacto(descripcion, contacto),
    fecha,
    hora: /^\d{2}:\d{2}$/.test(hora || '') ? hora : null,
    prioridad: ['baja', 'normal', 'alta'].includes(prioridad) ? prioridad : 'normal',
    asignado_a: asignadoA || usuario?.id || null,
    cliente_id: cliente?.id || null,
    creado_por: usuario?.id || null,
  }
  const [tarea] = await rest('tareas', { metodo: 'POST', cuerpo: fila })
  if (cliente) await evento(usuario, cliente.id, 'tarea', { titulo: fila.titulo, done: false, ...datosEvento }).catch(() => {})
  return { ok: true, tareaId: tarea.id, clienteId: cliente?.id || null, ...(cliente ? {} : { sinCliente: true }) }
}

/** Tarea en el CRM para este cliente. */
export async function crearTarea(jid, datos = {}, usuario) {
  validarTarea(datos)
  const { cliente, contacto } = await destinoDeTarea(jid)
  return tareaDe(cliente, datos, usuario, {}, contacto)
}

/**
 * Alerta en el CRM para este cliente: avisa por push, mail y WhatsApp a la fecha y hora
 * elegidas (api/crm/check-alertas.js y alertas.js). A diferencia de la tarea, la hora es
 * obligatoria y siempre tiene a quién avisar.
 */
export async function crearAlerta(jid, { titulo, descripcion, fecha, hora, asignadoA } = {}, usuario) {
  const limpio = String(titulo || '').trim()
  if (!limpio) throw error('La alerta necesita un título.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) throw error('Elegí la fecha de la alerta.')
  if (!/^\d{2}:\d{2}$/.test(hora || '')) throw error('Elegí la hora de la alerta.')
  const asignado = asignadoA || usuario?.id
  if (!asignado) throw error('Elegí a quién avisarle.')
  const { cliente, contacto } = await destinoDeTarea(jid)
  const fila = {
    titulo: limpio.slice(0, 200),
    descripcion: detalleConContacto(descripcion, contacto),
    fecha,
    hora,
    asignado_a: asignado,
    cliente_id: cliente?.id || null,
    creado_por: usuario?.id || null,
  }
  const [alerta] = await rest('alertas', { metodo: 'POST', cuerpo: fila })
  return { ok: true, alertaId: alerta.id, clienteId: cliente?.id || null, ...(cliente ? {} : { sinCliente: true }) }
}

/** Usuarios activos del CRM, para asignar la tarea o la alerta. */
export async function usuariosCrm() {
  return rest('usuarios?select=id,nombre,usuario,rol&activo=eq.true&order=nombre.asc')
}

/* ---------------- Por teléfono (el bot de respuestas automáticas, sin chat) ---------------- */

/** El cliente cuyo teléfono coincide (misma regla que el vínculo automático del chat), o null. */
export async function clientePorTelefono(telefono) {
  const normal = normalizarAR(telefono)
  if (!normal) return null
  return vistaCliente((await clientes()).porTelefono.get(normal)) || null
}

async function clienteDeTelefono(telefono) {
  const cliente = await clientePorTelefono(telefono)
  if (!cliente) throw error('Ese teléfono no es cliente del CRM.', 404)
  return cliente
}

/** Devuelve el cliente de ese teléfono; si no existe lo da de alta. { cliente, creado } */
export async function asegurarCliente({ telefono, nombre, localidad, interes, notas } = {}, usuario) {
  const normal = normalizarAR(telefono)
  if (!normal) throw error('Teléfono inválido.')
  const interesLimpio = String(interes || '').trim()
  const existente = await clientePorTelefono(telefono)
  if (existente) {
    if (interesLimpio) await seguimientoDe(existente, `Interés: ${interesLimpio}`.slice(0, 2000), usuario, 'bot')
    return { cliente: existente, creado: false }
  }
  const fila = await altaCliente(
    {
      nombre: String(nombre || '').trim().slice(0, 120) || 'Contacto de WhatsApp',
      telefono: telefonoParaCrm(normal, `+${normal}`),
      localidad,
      notas: [String(notas || '').trim(), interesLimpio && `Interés: ${interesLimpio}`].filter(Boolean).join('\n'),
    },
    usuario,
    'bot',
  )
  return { cliente: vistaCliente(fila), creado: true }
}

export async function seguimientoPorTelefono(telefono, texto, usuario) {
  const limpio = textoSeguimiento(texto)
  return seguimientoDe(await clienteDeTelefono(telefono), limpio, usuario, 'bot')
}

/** Sin fecha, la tarea es para hoy (hora de Argentina, UTC-3). */
export async function tareaPorTelefono(telefono, datos = {}, usuario) {
  const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
  const completos = { ...datos, fecha: datos.fecha || hoy }
  validarTarea(completos)
  return tareaDe(await clienteDeTelefono(telefono), completos, usuario, { via: 'bot' })
}

/* ---------------- Alta automática ---------------- */

let empleados = { ts: 0, telefonos: new Set() }

async function telefonosEmpleados() {
  if (Date.now() - empleados.ts < CACHE_MS) return empleados.telefonos
  const filas = await rest('usuarios?select=telefono&telefono=not.is.null')
  empleados = { ts: Date.now(), telefonos: new Set(filas.map((u) => telefonoEmpleado(u.telefono)).filter(Boolean)) }
  return empleados.telefonos
}

const enCurso = new Set()

/**
 * Quien escribe por primera vez queda cargado como cliente (preferencia
 * "clientesAutomaticos"). No entran los grupos, los empleados del CRM, los chats que ya
 * tienen un cliente elegido a mano o marcados como "no es cliente", ni los números que ya
 * están en el CRM. Devuelve el cliente creado o null.
 */
export async function altaAutomatica(jid) {
  if (!CRM_CONFIGURADO || esGrupo(jid) || buscarChat(jid)?.clienteId) return null
  const telefono = telefonoDelChat(jid)
  const normal = normalizarAR(telefono)
  if (!normal || enCurso.has(normal)) return null
  enCurso.add(normal)
  try {
    if ((await clientes()).porTelefono.has(normal) || (await telefonosEmpleados()).has(normal)) return null
    // Antes de crear se vuelve a leer la lista del CRM (rara vez: solo con números nuevos): alguien
    // pudo cargarlo a mano hace instantes y la copia en memoria tiene hasta 2 minutos.
    olvidarCache()
    if ((await clientes()).porTelefono.has(normal)) return null
    const nombre = nombreDe(jid)
    const cliente = await altaCliente(
      {
        // Sin nombre de WhatsApp, nombreDe devuelve el número: mejor un nombre que se note pendiente.
        nombre: /^\+?[\d\s-]+$/.test(nombre) ? 'Contacto de WhatsApp' : nombre.slice(0, 120),
        telefono: telefonoParaCrm(normal, telefono),
      },
      null,
      'whatsapp_automatico',
    )
    return vistaCliente(cliente)
  } finally {
    enCurso.delete(normal)
  }
}
