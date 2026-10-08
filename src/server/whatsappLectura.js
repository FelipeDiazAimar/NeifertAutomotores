/**
 * WhatsApp en solo lectura, para cuando la PC servidor está apagada (o la app cerrada).
 *
 * Los chats y los mensajes ya quedan guardados en la base del WhatsApp (Supabase, esquema
 * `wa`) y los archivos en R2: acá se leen desde ahí, sin pasar por la PC. El CRM abre el
 * mismo panel del WhatsApp (copiado en /wa-lectura/) y este módulo contesta las mismas
 * rutas que el servidor, pero solo las de leer. Mandar, archivar o cualquier cambio
 * necesita el servidor encendido: esas rutas contestan 423.
 *
 * Entra el usuario logueado del CRM (su token se canjea por una cookie firmada, como en el
 * servidor) y solo si su rol tiene acceso al WhatsApp.
 *
 * Variables: WA_DATABASE_URL o WA_SUPABASE_URL (la base del WhatsApp), WA_R2_BUCKET / WA_R2_ENDPOINT /
 * WA_R2_ACCESS_KEY_ID / WA_R2_SECRET_ACCESS_KEY (los archivos), VITE_SUPABASE_URL /
 * VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (los usuarios del CRM). Opcionales:
 * WA_LINEA (qué línea mostrar; si no, la que tuvo actividad más reciente),
 * WHATSAPP_ROLES / WHATSAPP_ROLES_LINEA / WHATSAPP_ROLES_LECTURA (los mismos del servidor).
 */
import crypto from 'node:crypto'
import path from 'node:path'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const COOKIE = 'nf_wa_lectura'
const SESION_HORAS = 12
const OCULTOS = new Set(['0@s.whatsapp.net'])
const SOLO_LECTURA = 'La PC servidor del WhatsApp está apagada: por ahora solo se pueden leer los chats.'

/* ---------------- Utilidades ---------------- */

const lista = (texto) => String(texto || '').split(',').map((s) => s.trim()).filter(Boolean)
const segundos = (v) => (v ? Math.floor(new Date(v).getTime() / 1000) : 0)
const clave = (jid) => jid.replace(/[^0-9a-z]+/gi, '_')
const esGrupo = (jid) => !!jid && jid.endsWith('@g.us')
const telefonoDe = (jid) => {
  const m = /^(\d+)@s\.whatsapp\.net$/.exec(jid || '')
  return m ? `+${m[1]}` : null
}
const chatValido = (jid) => /^[\w.+-]+@(s\.whatsapp\.net|lid|g\.us)$/.test(jid || '')
function silenciadoActivo(hasta) {
  if (!hasta) return false
  if (hasta < 0) return true
  return (hasta < 1e12 ? hasta * 1000 : hasta) > Date.now()
}
const fallo = (status, error, extra = {}) => Object.assign(new Error(error), { status, extra })

function leerCookies(req) {
  const out = {}
  for (const parte of String(req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=')
    if (i > 0) out[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim())
  }
  return out
}

/* ---------------- Conexiones (se reusan entre pedidos) ---------------- */

/**
 * Conexión para funciones serverless. Con el pooler de Supabase se usa SIEMPRE el modo
 * transacción (puerto 6543): en modo sesión (5432) cada conexión abierta ocupa uno de los
 * pocos lugares del pool (15) aunque esté quieta, y Vercel congela las copias de la función
 * con sus conexiones abiertas. Al abrir la bandeja se piden muchas fotos a la vez, cada
 * copia abría las suyas y el servidor de la PC se quedaba sin lugar para arrancar
 * ("max clients reached in session mode"). En modo transacción las quietas no ocupan nada.
 */
export function urlParaFunciones(url) {
  try {
    const u = new URL(url)
    if (u.hostname.endsWith('.pooler.supabase.com') && (u.port === '' || u.port === '5432')) u.port = '6543'
    return u.toString()
  } catch {
    return url
  }
}

let pool = null
function base(env) {
  // Mismos nombres que acepta el servidor (Whatsapp/servidor/src/config.js).
  const url = env.WA_DATABASE_URL || env.WA_SUPABASE_URL
  if (!url) throw fallo(501, 'Falta WA_DATABASE_URL: no se puede leer el WhatsApp sin el servidor.')
  // Una conexión por copia de la función, que se suelta enseguida si queda sin uso.
  pool ??= new pg.Pool({
    connectionString: urlParaFunciones(url),
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 2_000,
    allowExitOnIdle: true,
  })
  return pool
}

let s3 = null
function r2(env) {
  const endpoint = env.WA_R2_ENDPOINT || env.R2_ENDPOINT
  const accessKeyId = env.WA_R2_ACCESS_KEY_ID || env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.WA_R2_SECRET_ACCESS_KEY || env.R2_SECRET_ACCESS_KEY
  if (!env.WA_R2_BUCKET || !endpoint || !accessKeyId || !secretAccessKey) return null
  s3 ??= new S3Client({ endpoint, region: 'auto', credentials: { accessKeyId, secretAccessKey } })
  return s3
}

let lineaCache = { ts: 0, linea: null }
/** La línea a mostrar: WA_LINEA o la que tuvo actividad más reciente. */
async function lineaActual(env) {
  if (env.WA_LINEA) return String(env.WA_LINEA).replace(/\D/g, '')
  if (lineaCache.linea && Date.now() - lineaCache.ts < 60_000) return lineaCache.linea
  const { rows } = await base(env).query('select linea from wa.chats group by linea order by max(ultimo_ts) desc nulls last limit 1')
  if (!rows[0]) throw fallo(404, 'Todavía no hay chats guardados del WhatsApp.')
  lineaCache = { ts: Date.now(), linea: rows[0].linea }
  return rows[0].linea
}

/* ---------------- Sesión ---------------- */

const secreto = (env) => crypto.createHash('sha256').update(`nf-wa-lectura:${env.WA_LECTURA_SECRETO || env.SUPABASE_SERVICE_ROLE_KEY || ''}`).digest()
const firmar = (env, datos) => crypto.createHmac('sha256', secreto(env)).update(datos).digest('base64url')

function crearCookie(env, usuario) {
  const datos = Buffer.from(JSON.stringify({ u: usuario, exp: Date.now() + SESION_HORAS * 3600e3 })).toString('base64url')
  return `${datos}.${firmar(env, datos)}`
}

function usuarioDeCookie(env, req) {
  const valor = leerCookies(req)[COOKIE]
  if (!valor) return null
  const [datos, firma] = valor.split('.')
  const esperada = firmar(env, datos || '')
  if (!firma || firma.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null
  try {
    const { u, exp } = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8'))
    return exp > Date.now() ? u : null
  } catch {
    return null
  }
}

function ponerCookie(req, res, valor, maxAge) {
  const segura = (req.headers['x-forwarded-proto'] || '').includes('https') || /^https/.test(req.headers.origin || '')
  res.setHeader('Set-Cookie', `${COOKIE}=${valor}; Path=/wa-lectura; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${segura ? '; Secure' : ''}`)
}

/** Mismos roles que el servidor del WhatsApp. En modo lectura nadie escribe ni maneja la línea. */
function puedeEntrar(env, rol) {
  const roles = [
    ...lista(env.WHATSAPP_ROLES ?? 'admin,dueno,vendedor'),
    ...lista(env.WHATSAPP_ROLES_LINEA ?? 'admin,dueno'),
    ...lista(env.WHATSAPP_ROLES_LECTURA ?? ''),
  ]
  return roles.includes(rol)
}

async function iniciarSesion(env, req, res) {
  const token = String(req.body?.token || '')
  if (!token) throw fallo(401, 'Falta el token del CRM', { login: true })
  const url = env.VITE_SUPABASE_URL
  if (!url || !env.VITE_SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) throw fallo(501, 'Faltan las credenciales de Supabase del CRM')
  const opciones = { auth: { persistSession: false, autoRefreshToken: false } }
  const { data, error } = await createClient(url, env.VITE_SUPABASE_ANON_KEY, opciones).auth.getUser(token)
  if (error || !data?.user?.id) throw fallo(401, 'La sesión del CRM venció. Volvé a abrir el WhatsApp desde el CRM.', { login: true })
  const { data: fila } = await createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, opciones)
    .schema('crm')
    .from('usuarios')
    .select('id,usuario,nombre,rol,activo')
    .eq('id', data.user.id)
    .maybeSingle()
  if (!fila?.activo || !puedeEntrar(env, fila.rol)) {
    throw fallo(403, 'Tu usuario del CRM no tiene acceso al WhatsApp. Pedíselo a un administrador.', { login: true })
  }
  const usuario = { id: fila.id, nombre: fila.nombre || fila.usuario || 'Sin nombre', rol: fila.rol, escribir: false, linea: false }
  ponerCookie(req, res, crearCookie(env, usuario), SESION_HORAS * 3600)
  return { usuario, login: true }
}

/* ---------------- Lecturas ---------------- */

/**
 * El estado guardado de la línea (marcas, fotos, carpetas de archivos). Se guarda un minuto:
 * cada foto de perfil y cada archivo lo necesitan, y al abrir la bandeja se piden cientos.
 */
const estados = new Map() // linea → { ts, estado }
async function estadoGuardado(env, linea) {
  const guardado = estados.get(linea)
  if (guardado && Date.now() - guardado.ts < 60_000) return guardado.estado
  const { rows } = await base(env).query(
    "select clave, valor from wa.estado where linea = $1 and clave in ('marcas', 'fotos', 'carpetas')",
    [linea],
  )
  const valor = Object.fromEntries(rows.map((r) => [r.clave, r.valor]))
  const estado = { marcas: valor.marcas || {}, fotos: valor.fotos || {}, carpetas: valor.carpetas || {} }
  estados.set(linea, { ts: Date.now(), estado })
  return estado
}

/** Lo mismo que listarChats() del servidor (almacen.js → vistaChat). */
async function listarChats(env, linea) {
  const db = base(env)
  const [chats, contactos, estado] = await Promise.all([
    db.query('select jid, nombre_grupo, no_leidos, ultimo_ts, ultimo, datos from wa.chats where linea = $1', [linea]),
    db.query('select jid, nombre_agenda, nombre_propio from wa.contactos where linea = $1', [linea]),
    estadoGuardado(env, linea),
  ])
  const agenda = new Map(contactos.rows.map((f) => [f.jid, { nombre: f.nombre_agenda || null, notify: f.nombre_propio || null }]))
  const { archivados = {}, fijados = {}, silenciados = {} } = estado.marcas
  return chats.rows
    .filter((f) => !OCULTOS.has(f.jid))
    .map((f) => {
      const c = {
        id: f.jid,
        noLeidos: f.no_leidos || 0,
        ultimoTs: segundos(f.ultimo_ts),
        ultimo: f.ultimo || null,
        ...(f.nombre_grupo ? { grupoNombre: f.nombre_grupo } : {}),
        ...(f.datos || {}),
      }
      const contacto = agenda.get(c.id)
      return {
        ...c,
        nombre: esGrupo(c.id)
          ? c.grupoNombre || 'Grupo'
          : contacto?.nombre || c.pushName || contacto?.notify || telefonoDe(c.id) || c.id.split('@')[0],
        telefono: telefonoDe(c.id),
        esGrupo: esGrupo(c.id),
        guardadoEnAgenda: !!contacto?.nombre,
        notify: contacto?.notify || null,
        archivado: !!archivados[c.id],
        fijado: fijados[c.id] || null,
        silenciado: silenciadoActivo(silenciados[c.id]),
        foto: estado.fotos[c.id]?.tiene ? estado.fotos[c.id].ts : null,
      }
    })
    .sort((a, b) => (b.ultimoTs || 0) - (a.ultimoTs || 0))
}

const COLUMNAS = 'id, ts, de_mi, tipo, texto, autor_jid, enviado_por, estado, origen, eliminado_en, datos'

/** Lo mismo que mensajeDeFila() + vistaMensaje() del servidor: sin `raw`. */
function mensajeDeFila(f) {
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
  delete m.raw
  return m
}

/** Una página de mensajes, igual que paginaDeMensajes() del servidor. */
async function paginaDeMensajes(env, linea, jid, { limite, antes }) {
  const n = Math.min(Math.max(Number(limite) || 400, 1), 2000)
  const db = base(env)
  let corte = null
  if (antes) {
    const { rows } = await db.query('select ts from wa.mensajes where linea = $1 and chat_jid = $2 and id = $3', [linea, jid, antes])
    corte = rows[0] ? { ts: rows[0].ts, id: antes } : null
  }
  const filtro = corte ? 'and (ts, id) < ($4, $5)' : ''
  const [pagina, total] = await Promise.all([
    db.query(
      `select ${COLUMNAS} from wa.mensajes where linea = $1 and chat_jid = $2 ${filtro} order by ts desc, id desc limit $3`,
      corte ? [linea, jid, n + 1, corte.ts, corte.id] : [linea, jid, n + 1],
    ),
    db.query('select count(*)::int as n from wa.mensajes where linea = $1 and chat_jid = $2', [linea, jid]),
  ])
  const filas = pagina.rows.slice(0, n).reverse()
  return { mensajes: filas.map(mensajeDeFila), hayAnteriores: pagina.rows.length > n, total: total.rows[0]?.n || 0 }
}

async function unMensaje(env, linea, jid, id) {
  const { rows } = await base(env).query(`select ${COLUMNAS} from wa.mensajes where linea = $1 and chat_jid = $2 and id = $3`, [linea, jid, id])
  if (!rows[0]) throw fallo(404, 'El mensaje no está guardado')
  return mensajeDeFila(rows[0])
}

/** Búsqueda de texto en todos los chats (o en uno), como buscarMensajes() del servidor. */
async function buscar(env, linea, { q, chat, desde, limite }) {
  const texto = String(q || '').trim()
  if (texto.length < 2) return { resultados: [], truncado: false }
  const n = Math.min(Math.max(Number(limite) || 80, 1), 500)
  const inicio = Math.max(0, Number(desde) || 0)
  const parametros = [linea, `%${texto.replace(/[%_\\]/g, '\\$&')}%`, n + 1, inicio]
  const { rows } = await base(env).query(
    `select chat_jid, ${COLUMNAS} from wa.mensajes
      where linea = $1 and texto ilike $2 ${chat ? 'and chat_jid = $5' : ''}
      order by ts desc limit $3 offset $4`,
    chat ? [...parametros, chat] : parametros,
  )
  const resultados = rows.slice(0, n).map((f) => ({ chatId: f.chat_jid, ...mensajeDeFila(f) }))
  return { resultados, truncado: rows.length > n, desde: inicio }
}

/** Enlace temporal de R2 para un archivo de la línea (como servir() del servidor). */
async function enlaceR2(env, claveReal, { nombre, descargar, mime } = {}) {
  const cliente = r2(env)
  if (!cliente) throw fallo(501, 'Faltan las credenciales de R2 del WhatsApp: los archivos no se pueden ver sin el servidor.')
  const disposicion = nombre ? `${descargar ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(nombre)}` : undefined
  return getSignedUrl(
    cliente,
    new GetObjectCommand({
      Bucket: env.WA_R2_BUCKET,
      Key: claveReal,
      ...(disposicion ? { ResponseContentDisposition: disposicion } : {}),
      ...(mime ? { ResponseContentType: mime } : {}),
    }),
    { expiresIn: 3600 },
  )
}

async function enlaceMedia(env, linea, jid, id, descargar) {
  const m = await unMensaje(env, linea, jid, id)
  if (!m.media?.archivo || m.media.estado !== 'ok') throw fallo(404, 'El archivo no se había descargado antes de que se apagara el servidor.')
  const { carpetas } = await estadoGuardado(env, linea)
  const claveReal = `lineas/${linea}/media/${carpetas[jid] || clave(jid)}/${path.basename(m.media.archivo)}`
  return enlaceR2(env, claveReal, { nombre: m.media.nombre || path.basename(m.media.archivo), descargar, mime: m.media.mime })
}

/**
 * ¿Está andando el servidor del WhatsApp (la PC)? Se pregunta desde acá y no desde el
 * navegador: con el dominio en Cloudflare, aunque la PC esté apagada Cloudflare contesta
 * con su página de error (530/1033), y el navegador no puede leer esa respuesta para
 * distinguirla. Cuenta solo si contesta el servidor de verdad: su /api/salud trae `conexion`
 * (también con la línea desconectada, que es un 503 pero el servidor anda).
 */
async function servidorAnda(env) {
  const base = String(env.VITE_WHATSAPP_PANEL_URL || '').replace(/\/+$/, '')
  if (!/^https?:\/\//.test(base)) return { responde: false, motivo: 'Falta VITE_WHATSAPP_PANEL_URL' }
  try {
    const r = await fetch(`${base}/api/salud`, { signal: AbortSignal.timeout(6000), headers: { 'Cache-Control': 'no-cache' } })
    const datos = await r.json().catch(() => null)
    return { responde: typeof datos?.conexion === 'string', conexion: datos?.conexion || null }
  } catch {
    return { responde: false }
  }
}

/* ---------------- Rutas ---------------- */

/**
 * Atiende `ruta` (lo que va después de /wa-lectura/api/, por ejemplo "chats/<jid>/mensajes").
 * Devuelve el cuerpo JSON, o null si ya respondió (redirecciones a R2).
 */
async function atender(env, req, res, ruta) {
  const metodo = req.method || 'GET'
  const partes = ruta.split('/').filter(Boolean).map(decodeURIComponent)
  const q = req.query || {}

  // Sin sesión: solo dice si la PC servidor contesta (lo usa el CRM para elegir qué abrir).
  if (partes[0] === 'servidor') return servidorAnda(env)
  if (partes[0] === 'publico') {
    const host = req.headers['x-forwarded-host'] || req.headers.host
    // En Vercel llega x-forwarded-proto; en desarrollo (localhost) es http.
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host || '')
    const proto = String(req.headers['x-forwarded-proto'] || (local ? 'http' : 'https')).split(',')[0]
    return { origenesCrm: host ? [`${proto}://${host}`] : [] }
  }
  if (partes[0] === 'sesion' && partes[1] === 'salir') {
    ponerCookie(req, res, '', 0)
    return { ok: true }
  }
  if (partes[0] === 'sesion' && metodo === 'POST') return iniciarSesion(env, req, res)

  const usuario = usuarioDeCookie(env, req)
  if (!usuario) throw fallo(401, 'Volvé a abrir el WhatsApp desde el CRM.', { login: true })
  if (partes[0] === 'sesion') return { usuario, login: true }

  // Sin servidor no hay "quién está en cada chat": se acepta y no hace nada.
  if (partes[0] === 'viendo') return []
  if (metodo !== 'GET') throw fallo(423, SOLO_LECTURA)

  const linea = await lineaActual(env)
  const [seccion, jid, sub, id, extra] = partes
  if (seccion === 'estado') {
    return {
      conexion: 'nube',
      qr: null,
      puedeVincular: false,
      numeroLinea: `+${linea}`,
      yo: { id: `${linea}@s.whatsapp.net`, telefono: `+${linea}`, nombre: null },
      config: { descargarMedia: false, confirmarLectura: false, crm: false },
    }
  }
  if (seccion === 'agentes' || seccion === 'log') return []
  if (seccion === 'buscar') return buscar(env, linea, q)
  if (seccion === 'chats' && !jid) return listarChats(env, linea)
  if (seccion === 'chats' && chatValido(jid)) {
    if (sub === 'mensajes' && !id) return paginaDeMensajes(env, linea, jid, { limite: q.limite, antes: q.antes || null })
    if (sub === 'mensajes' && id) return unMensaje(env, linea, jid, id)
    if (sub === 'media' && id && extra === 'miniatura') {
      // La miniatura de 480 px que armó el servidor al bajar la foto o el video.
      const m = await unMensaje(env, linea, jid, id)
      if (!m.media?.miniatura) throw fallo(404, 'Sin miniatura')
      res.statusCode = 302
      res.setHeader('Location', await enlaceR2(env, `lineas/${linea}/${m.media.miniatura}`, { mime: 'image/jpeg' }))
      res.setHeader('Cache-Control', 'private, max-age=3600')
      res.end()
      return null
    }
    if (sub === 'media' && id) {
      res.statusCode = 302
      res.setHeader('Location', await enlaceMedia(env, linea, jid, id, !!q.descargar))
      res.setHeader('Cache-Control', 'private, max-age=600')
      res.end()
      return null
    }
    if (sub === 'foto') {
      const { fotos } = await estadoGuardado(env, linea)
      if (!fotos[jid]?.tiene) throw fallo(404, 'Sin foto de perfil')
      res.statusCode = 302
      res.setHeader('Location', await enlaceR2(env, `lineas/${linea}/fotos/${clave(jid)}.jpg`, { mime: 'image/jpeg' }))
      res.setHeader('Cache-Control', 'private, max-age=3600')
      res.end()
      return null
    }
  }
  throw fallo(404, 'Esto no está disponible mientras el servidor del WhatsApp está apagado.')
}

/**
 * Handler para Vercel (y el servidor de desarrollo). `ruta` sale de ?wa= (la reescritura
 * de /wa-lectura/api/* en vercel.json) o del final de la URL.
 */
export async function handleWhatsappLectura(req, res, { env = process.env, ruta } = {}) {
  const enviar = (status, cuerpo) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(cuerpo))
  }
  try {
    const camino = String(ruta ?? (Array.isArray(req.query?.wa) ? req.query.wa.join('/') : req.query?.wa) ?? '')
    const cuerpo = await atender(env, req, res, camino)
    if (cuerpo !== null) enviar(200, cuerpo)
  } catch (err) {
    if (!err.status) console.error('[whatsapp-lectura]', err)
    enviar(err.status || 500, { error: err.status ? err.message : 'No se pudo leer el WhatsApp guardado.', ...(err.extra || {}) })
  }
}
