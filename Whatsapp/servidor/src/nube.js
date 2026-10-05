/*
 * Mensajes, chats y contactos en Supabase (esquema "wa", ver supabase/whatsapp_schema.sql).
 *
 * Cómo trabaja, para no pegarle a la base con cada mensaje:
 *   - Al arrancar se trae todo a memoria (cargarTodo). Desde ahí el servidor lee siempre
 *     de memoria: abrir un chat o buscar no consulta la base.
 *   - Cada cambio se anota como pendiente y se escribe en tandas cada ~1,5 s (o antes si
 *     se juntan muchos), todo en una transacción. Si la base no responde, lo pendiente
 *     queda en la cola y se reintenta.
 *
 * Solo se usa con ALMACEN=supabase. Con ALMACEN=local el servidor trabaja con archivos.
 *
 * Cada fila lleva la línea (número de WhatsApp) a la que pertenece, y todo lo que se lee o
 * se escribe acá es solo de la línea con la que corre el servidor (CLAVE_LINEA). Varias
 * líneas (la de prueba y la de la concesionaria) comparten la base sin mezclarse.
 */
import pg from 'pg'
import { CLAVE_LINEA, WA_DATABASE_URL } from './config.js'
import { log } from './eventos.js'
import * as diario from './diario.js'

const LINEA = CLAVE_LINEA
const ESPERA_MS = 1500
const TANDA = 500 // filas por consulta
const MAX_PENDIENTES = 800 // con más que esto se escribe sin esperar

let pool = null
function base() {
  pool ??= new pg.Pool({ connectionString: WA_DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 })
  return pool
}

/** Consulta suelta, fuera de las tandas (auditoría, bandeja de salida, mantenimiento). */
export const consultar = (sql, params) => base().query(sql, params)

/* ---------------- Conversión memoria ↔ filas ---------------- */

// Segundos o milisegundos → fecha para la base. -1 (silenciado para siempre) → infinito.
function fecha(v) {
  if (v == null || v === false) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  if (n < 0) return 'infinity'
  return new Date(n < 1e12 ? n * 1000 : n).toISOString()
}
const segundos = (d) => (d ? Math.floor(new Date(d).getTime() / 1000) : 0)

// jsonb no acepta el carácter nulo dentro de un texto.
const aJson = (v) => JSON.stringify(v).replace(/\\u0000/g, '')

function filaMensaje(chatJid, m) {
  return {
    chat_jid: chatJid,
    id: m.id,
    ts: fecha(m.ts) || new Date().toISOString(),
    de_mi: !!m.deMi,
    tipo: m.tipo || 'otro',
    texto: m.texto ?? null,
    autor_jid: m.autor || null,
    enviado_por: m.enviadoPor || null,
    estado: m.estado || null,
    origen: m.origen === 'historial' ? 'historial' : 'vivo',
    eliminado_en: fecha(m.eliminado?.ts),
    datos: m,
  }
}

function mensajeDeFila(f) {
  // "datos" tiene el mensaje completo tal como lo maneja el servidor; las columnas
  // sueltas completan lo que falte (filas cargadas a mano, por ejemplo).
  const m = {
    id: f.id,
    ts: segundos(f.ts),
    deMi: f.de_mi,
    tipo: f.tipo,
    texto: f.texto ?? undefined,
    origen: f.origen,
    ...(f.autor_jid ? { autor: f.autor_jid } : {}),
    ...(f.enviado_por ? { enviadoPor: f.enviado_por } : {}),
    ...(f.estado ? { estado: f.estado } : {}),
    ...(f.eliminado_en ? { eliminado: { ts: segundos(f.eliminado_en), por: 'contacto' } } : {}),
    ...(f.datos || {}),
  }
  if (m.texto === undefined) delete m.texto
  return m
}

function filaChat(c, marcas) {
  return {
    jid: c.id,
    nombre_grupo: c.grupoNombre || null,
    archivado: !!marcas.archivados[c.id],
    fijado_en: fecha(marcas.fijados[c.id]),
    silenciado_hasta: fecha(marcas.silenciados[c.id]),
    no_leidos: c.noLeidos || 0,
    ultimo_ts: fecha(c.ultimoTs),
    ultimo: c.ultimo || null,
    datos: c,
  }
}

function chatDeFila(f) {
  return {
    id: f.jid,
    noLeidos: f.no_leidos || 0,
    ultimoTs: segundos(f.ultimo_ts),
    ultimo: f.ultimo || null,
    ...(f.nombre_grupo ? { grupoNombre: f.nombre_grupo } : {}),
    ...(f.datos || {}),
  }
}

/* ---------------- Carga inicial ---------------- */

/**
 * Trae todo de la base. Devuelve el mismo formato que usa el almacén en memoria:
 * { estado, mensajes: Map(jid → Map(id → mensaje)) }.
 */
export async function cargarTodo() {
  const db = base()
  const [kv, contactos, chats] = await Promise.all([
    db.query('select clave, valor from wa.estado where linea = $1', [LINEA]),
    db.query('select jid, nombre_agenda, nombre_propio from wa.contactos where linea = $1', [LINEA]),
    db.query('select jid, nombre_grupo, no_leidos, ultimo_ts, ultimo, datos from wa.chats where linea = $1', [LINEA]),
  ])
  const valor = Object.fromEntries(kv.rows.map((r) => [r.clave, r.valor]))
  const marcas = valor.marcas || {}
  const estado = {
    chats: Object.fromEntries(chats.rows.map((f) => [f.jid, chatDeFila(f)])),
    contactos: Object.fromEntries(
      contactos.rows.map((f) => [
        f.jid,
        { ...(f.nombre_agenda ? { nombre: f.nombre_agenda } : {}), ...(f.nombre_propio ? { notify: f.nombre_propio } : {}) },
      ]),
    ),
    lids: valor.lids || {},
    meta: valor.meta || {},
    fotos: valor.fotos || {},
    carpetas: valor.carpetas || {},
    config: valor.config || {},
    archivados: marcas.archivados || {},
    fijados: marcas.fijados || {},
    silenciados: marcas.silenciados || {},
  }

  // Mensajes de a tandas, ordenados por clave para poder paginar sin OFFSET.
  const mensajes = new Map()
  let desde = ['', '']
  for (;;) {
    const { rows } = await db.query(
      `select chat_jid, id, ts, de_mi, tipo, texto, autor_jid, enviado_por, estado, origen, eliminado_en, datos
         from wa.mensajes
        where linea = $3 and (chat_jid, id) > ($1, $2)
        order by chat_jid, id
        limit 5000`,
      [...desde, LINEA],
    )
    for (const f of rows) {
      if (!mensajes.has(f.chat_jid)) mensajes.set(f.chat_jid, new Map())
      mensajes.get(f.chat_jid).set(f.id, mensajeDeFila(f))
    }
    if (rows.length < 5000) break
    const u = rows.at(-1)
    desde = [u.chat_jid, u.id]
  }
  return { estado, mensajes }
}

/* ---------------- Escritura en tandas ---------------- */

const pendientes = {
  mensajes: new Map(), // "jid\nid" → [jid, id]
  chats: new Set(),
  contactos: new Set(),
  estado: false,
  borrarChats: new Set(),
  borrarAntesDe: 0, // segundos: se borran los mensajes anteriores (ventana de días)
  borrarMensajes: new Map(), // "jid\nid" → [jid, id]: mensajes sueltos que se quitan (bandeja de salida)
}
let leerEstado = null // lo pone el almacén: devuelve su estado y sus mensajes en memoria
let timer = null
let escribiendo = null

export function conectarAlmacen(fn) {
  leerEstado = fn
}

function programar() {
  const cantidad = pendientes.mensajes.size + pendientes.chats.size + pendientes.contactos.size
  if (cantidad >= MAX_PENDIENTES) return void escribir()
  if (!timer) timer = setTimeout(escribir, ESPERA_MS)
}

export function mensajeCambiado(jid, id) {
  pendientes.mensajes.set(`${jid}\n${id}`, [jid, id])
  pendientes.chats.add(jid)
  programar()
}
export function chatCambiado(jid) {
  pendientes.chats.add(jid)
  programar()
}
export function contactoCambiado(jid) {
  pendientes.contactos.add(jid)
  programar()
}
export function estadoCambiado() {
  pendientes.estado = true
  programar()
}
/** Un mensaje suelto se quita de la base (por ejemplo, el borrador de la bandeja de salida ya enviado). */
export function mensajeBorrado(jid, id) {
  const k = `${jid}\n${id}`
  pendientes.mensajes.delete(k)
  pendientes.borrarMensajes.set(k, [jid, id])
  programar()
}

/** Los mensajes anteriores a `corte` (segundos) salieron de la ventana: se borran de la base. */
export function mensajesAnterioresBorrados(corte) {
  pendientes.borrarAntesDe = Math.max(pendientes.borrarAntesDe, corte)
  programar()
}
export function chatBorrado(jid) {
  pendientes.borrarChats.add(jid)
  pendientes.chats.delete(jid)
  for (const [k, [j]] of pendientes.mensajes) if (j === jid) pendientes.mensajes.delete(k)
  programar()
}

const SQL_MENSAJES = `
  insert into wa.mensajes (linea, chat_jid, id, ts, de_mi, tipo, texto, autor_jid, enviado_por, estado, origen, eliminado_en, datos)
  select $2, chat_jid, id, ts, de_mi, tipo, texto, autor_jid, enviado_por, estado, origen, eliminado_en, datos
    from jsonb_to_recordset($1::jsonb) as x(chat_jid text, id text, ts timestamptz, de_mi boolean, tipo text,
         texto text, autor_jid text, enviado_por jsonb, estado text, origen text, eliminado_en timestamptz, datos jsonb)
  on conflict (linea, chat_jid, id) do update set
    ts = excluded.ts, de_mi = excluded.de_mi, tipo = excluded.tipo, texto = excluded.texto,
    autor_jid = excluded.autor_jid, enviado_por = excluded.enviado_por, estado = excluded.estado,
    origen = excluded.origen, eliminado_en = excluded.eliminado_en, datos = excluded.datos`

// Los chats se escriben DESPUÉS de los mensajes: así lo que calculó el servidor (no
// leídos, archivado, último mensaje) queda por encima de lo que hagan los automatismos
// de la base al insertar cada mensaje.
const SQL_CHATS = `
  insert into wa.chats (linea, jid, nombre_grupo, archivado, fijado_en, silenciado_hasta, no_leidos, ultimo_ts, ultimo, datos)
  select $2, jid, nombre_grupo, archivado, fijado_en, silenciado_hasta, no_leidos, ultimo_ts, ultimo, datos
    from jsonb_to_recordset($1::jsonb) as x(jid text, nombre_grupo text, archivado boolean, fijado_en timestamptz,
         silenciado_hasta timestamptz, no_leidos integer, ultimo_ts timestamptz, ultimo jsonb, datos jsonb)
  on conflict (linea, jid) do update set
    nombre_grupo = excluded.nombre_grupo, archivado = excluded.archivado, fijado_en = excluded.fijado_en,
    silenciado_hasta = excluded.silenciado_hasta, no_leidos = excluded.no_leidos, ultimo_ts = excluded.ultimo_ts,
    ultimo = excluded.ultimo, datos = excluded.datos`

const SQL_CONTACTOS = `
  insert into wa.contactos (linea, jid, nombre_agenda, nombre_propio, actualizado_en)
  select $2, jid, nombre_agenda, nombre_propio, now()
    from jsonb_to_recordset($1::jsonb) as x(jid text, nombre_agenda text, nombre_propio text)
  on conflict (linea, jid) do update set
    nombre_agenda = excluded.nombre_agenda, nombre_propio = excluded.nombre_propio, actualizado_en = now()`

const SQL_ESTADO = `
  insert into wa.estado (linea, clave, valor, actualizado_en)
  select $2, clave, valor, now() from jsonb_to_recordset($1::jsonb) as x(clave text, valor jsonb)
  on conflict (linea, clave) do update set valor = excluded.valor, actualizado_en = now()`

const trozos = (lista) => Array.from({ length: Math.ceil(lista.length / TANDA) }, (_, i) => lista.slice(i * TANDA, (i + 1) * TANDA))

/** Escribe en tandas lo que un volcado trae (se usa al escribir y al importar). */
async function volcar(cliente, { mensajes, chats, contactos, estadoKv, borrar, borrarAntesDe = 0, borrarMensajes = [] }, marcas) {
  for (const t of trozos(mensajes)) await cliente.query(SQL_MENSAJES, [aJson(t), LINEA])
  for (const t of trozos(chats.map((c) => filaChat(c, marcas)))) await cliente.query(SQL_CHATS, [aJson(t), LINEA])
  for (const t of trozos(contactos)) await cliente.query(SQL_CONTACTOS, [aJson(t), LINEA])
  if (estadoKv.length) await cliente.query(SQL_ESTADO, [aJson(estadoKv), LINEA])
  if (borrar.length) await cliente.query('delete from wa.chats where linea = $2 and jid = any($1)', [borrar, LINEA])
  if (borrarAntesDe) await cliente.query('delete from wa.mensajes where linea = $2 and ts < to_timestamp($1)', [borrarAntesDe, LINEA])
  for (const [jid, id] of borrarMensajes) await cliente.query('delete from wa.mensajes where linea = $3 and chat_jid = $1 and id = $2', [jid, id, LINEA])
}

const kvDe = (estado) => [
  { clave: 'marcas', valor: { archivados: estado.archivados, fijados: estado.fijados, silenciados: estado.silenciados } },
  { clave: 'lids', valor: estado.lids },
  { clave: 'meta', valor: estado.meta },
  { clave: 'fotos', valor: estado.fotos },
  { clave: 'carpetas', valor: estado.carpetas },
  { clave: 'config', valor: estado.config },
]

const contactoFila = (jid, c) => ({ jid, nombre_agenda: c?.nombre || null, nombre_propio: c?.notify || null })

/** Escribe lo pendiente. Una sola escritura a la vez; si llegan cambios mientras tanto, se encadena otra. */
export async function escribir() {
  clearTimeout(timer)
  timer = null
  if (escribiendo) return escribiendo
  if (!leerEstado) return
  const { estado, mensajes: enMemoria } = leerEstado()

  // Se toma una foto de lo pendiente y se vacía la cola: lo que cambie mientras se
  // escribe queda para la próxima tanda.
  const lote = {
    mensajes: [...pendientes.mensajes.values()]
      .map(([jid, id]) => {
        const m = enMemoria(jid)?.get(id)
        return m ? filaMensaje(jid, m) : null
      })
      .filter(Boolean),
    chats: [...pendientes.chats].map((jid) => estado.chats[jid]).filter(Boolean),
    contactos: [...pendientes.contactos].map((jid) => contactoFila(jid, estado.contactos[jid])),
    estadoKv: pendientes.estado ? kvDe(estado) : [],
    borrar: [...pendientes.borrarChats],
    borrarAntesDe: pendientes.borrarAntesDe,
    borrarMensajes: [...pendientes.borrarMensajes.values()],
  }
  const respaldo = {
    mensajes: new Map(pendientes.mensajes),
    chats: new Set(pendientes.chats),
    contactos: new Set(pendientes.contactos),
    estado: pendientes.estado,
    borrarChats: new Set(pendientes.borrarChats),
    borrarAntesDe: pendientes.borrarAntesDe,
    borrarMensajes: new Map(pendientes.borrarMensajes),
  }
  pendientes.mensajes.clear()
  pendientes.chats.clear()
  pendientes.contactos.clear()
  pendientes.estado = false
  pendientes.borrarChats.clear()
  pendientes.borrarAntesDe = 0
  pendientes.borrarMensajes.clear()

  const hayAlgo =
    lote.mensajes.length || lote.chats.length || lote.contactos.length || lote.estadoKv.length || lote.borrar.length ||
    lote.borrarAntesDe || lote.borrarMensajes.length
  if (!hayAlgo) return
  // Lo anotado en el diario hasta acá es lo que lleva esta tanda: se borra cuando Supabase confirme.
  const tramo = diario.cerrarTramo()

  escribiendo = (async () => {
    const cliente = await base().connect()
    try {
      await cliente.query('begin')
      await volcar(cliente, lote, estado)
      await cliente.query('commit')
      diario.tramoGuardado(tramo)
    } catch (err) {
      await cliente.query('rollback').catch(() => {})
      // Lo que no se pudo escribir vuelve a la cola y se reintenta en 10 s.
      for (const [k, v] of respaldo.mensajes) if (!pendientes.mensajes.has(k)) pendientes.mensajes.set(k, v)
      for (const j of respaldo.chats) pendientes.chats.add(j)
      for (const j of respaldo.contactos) pendientes.contactos.add(j)
      for (const j of respaldo.borrarChats) pendientes.borrarChats.add(j)
      pendientes.estado ||= respaldo.estado
      pendientes.borrarAntesDe = Math.max(pendientes.borrarAntesDe, respaldo.borrarAntesDe)
      for (const [k, v] of respaldo.borrarMensajes) if (!pendientes.borrarMensajes.has(k)) pendientes.borrarMensajes.set(k, v)
      log('aviso', 'No se pudo guardar en Supabase, se reintenta', err.message)
      clearTimeout(timer)
      timer = setTimeout(escribir, 10000)
    } finally {
      cliente.release()
    }
  })()
  try {
    await escribiendo
  } finally {
    escribiendo = null
  }
  if (pendientes.mensajes.size || pendientes.chats.size || pendientes.contactos.size || pendientes.estado || pendientes.borrarChats.size || pendientes.borrarAntesDe || pendientes.borrarMensajes.size) {
    programar()
  }
}

/** Antes de apagar: escribe todo lo pendiente y cierra la conexión. */
export async function cerrar() {
  clearTimeout(timer)
  if (escribiendo) await escribiendo.catch(() => {})
  await escribir().catch(() => {})
  await pool?.end().catch(() => {})
}

export const pendientesDeGuardar = () =>
  pendientes.mensajes.size + pendientes.chats.size + pendientes.contactos.size + (pendientes.estado ? 1 : 0)

/* ---------------- Importar desde los archivos locales ---------------- */

/** Sube de una vez todo lo que hay en los archivos locales (lo usa scripts/importar-a-supabase.mjs). */
export async function importar(estado, mensajesPorChat) {
  const cliente = await base().connect()
  try {
    await cliente.query('begin')
    const mensajes = []
    for (const [jid, porId] of mensajesPorChat) for (const m of porId.values()) mensajes.push(filaMensaje(jid, m))
    await volcar(
      cliente,
      {
        mensajes,
        chats: Object.values(estado.chats),
        contactos: Object.entries(estado.contactos).map(([jid, c]) => contactoFila(jid, c)),
        estadoKv: kvDe(estado),
        borrar: [],
      },
      estado,
    )
    await cliente.query('commit')
    return { mensajes: mensajes.length, chats: Object.keys(estado.chats).length, contactos: Object.keys(estado.contactos).length }
  } catch (err) {
    await cliente.query('rollback').catch(() => {})
    throw err
  } finally {
    cliente.release()
  }
}

/* ---------------- Espacio usado ---------------- */

export async function tamanos() {
  const { rows } = await base().query(
    `select pg_total_relation_size('wa.mensajes') as mensajes,
            pg_total_relation_size('wa.chats') + pg_total_relation_size('wa.contactos') + pg_total_relation_size('wa.estado') as resto`,
  )
  return { mensajes: Number(rows[0].mensajes), resto: Number(rows[0].resto) }
}
