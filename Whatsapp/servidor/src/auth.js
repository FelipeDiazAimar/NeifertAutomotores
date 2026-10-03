/*
 * Login con los usuarios del CRM. No hay usuarios ni contraseñas propias: el panel
 * recibe la sesión de Supabase que ya tiene el CRM y este módulo la valida.
 *
 *   1. El CRM abre el panel pasándole su token de Supabase (#t=... en la URL).
 *   2. El panel lo manda a POST /api/sesion. Acá se le pregunta a Supabase de quién es
 *      y se mira en crm.usuarios si está activo. Todo usuario activo del CRM entra, con
 *      su nombre y su rol (WHATSAPP_ROLES puede limitarlo a algunos roles).
 *   3. Si todo da, se deja una cookie propia, firmada, que dura SESION_HORAS. Desde ahí
 *      cada pedido (también las fotos y el canal en vivo) viaja con esa cookie.
 *
 * La cookie guarda solo el id del usuario. En cada pedido se vuelve a mirar su ficha
 * (con 60 s de caché): si lo dan de baja en el CRM, deja de
 * entrar en menos de un minuto, sin esperar a que venza la cookie.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'
import {
  CRM_URL,
  DATA_DIR,
  LOGIN_CONFIGURADO,
  ROLES_WHATSAPP,
  SESION_HORAS,
  SESION_SECRETO,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from './config.js'

const COOKIE = 'nf_wa'
const CACHE_MS = 60 * 1000

/* ---------------- Quién hace cada pedido ---------------- */

// Acompaña a cada pedido de punta a punta, así el mensaje que se envía sabe quién lo
// mandó sin pasar el usuario por todas las funciones.
const contexto = new AsyncLocalStorage()

/** Usuario del pedido en curso: { id, nombre, rol }, o null si no hay login. */
export const usuarioActual = () => contexto.getStore()?.usuario || null

/**
 * Corre `fn` sin usuario. Hace falta para todo lo que sigue vivo después del pedido que
 * lo arrancó (la conexión con WhatsApp, las colas de descargas y fotos): si no, heredaría
 * al empleado que tocó el botón y le firmaría todo lo que pase después.
 */
export const sinUsuario = (fn) => contexto.exit(fn)

/* ---------------- Firma de la cookie ---------------- */

function secreto() {
  if (SESION_SECRETO) return SESION_SECRETO
  // Sin secreto configurado se genera uno y se guarda: así las sesiones sobreviven a
  // un reinicio del servidor.
  const archivo = path.join(DATA_DIR, 'secreto-sesion')
  try {
    return fs.readFileSync(archivo, 'utf8').trim()
  } catch {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const nuevo = crypto.randomBytes(32).toString('hex')
    fs.writeFileSync(archivo, nuevo, { mode: 0o600 })
    return nuevo
  }
}
const SECRETO = LOGIN_CONFIGURADO ? secreto() : ''
// Hay que entrar desde el CRM para usar el panel (salvo con el login apagado, solo en esta PC).
const PIDE_SESION = LOGIN_CONFIGURADO

const firmar = (texto) => crypto.createHmac('sha256', SECRETO).update(texto).digest('base64url')

function crearCookie(usuarioId) {
  const vence = Date.now() + SESION_HORAS * 3600 * 1000
  const cuerpo = `${usuarioId}.${vence}`
  return `${cuerpo}.${firmar(cuerpo)}`
}

/** Devuelve el id del usuario si la cookie es auténtica y no venció. */
function leerCookie(valor) {
  const partes = String(valor || '').split('.')
  if (partes.length !== 3) return null
  const [id, vence, firma] = partes
  const esperada = firmar(`${id}.${vence}`)
  const a = Buffer.from(firma)
  const b = Buffer.from(esperada)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  if (Number(vence) < Date.now()) return null
  return id
}

function cookieDe(req) {
  for (const par of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = par.trim().split('=')
    if (k === COOKIE) return decodeURIComponent(v.join('='))
  }
  return null
}

function ponerCookie(req, res, valor, maxAgeSeg) {
  const partes = [`${COOKIE}=${encodeURIComponent(valor)}`, 'Path=/', 'HttpOnly', `Max-Age=${maxAgeSeg}`]
  // El CRM muestra el panel embebido. Por https la cookie va cifrada y marcada para viajar
  // dentro del CRM aunque estén en dominios distintos (Partitioned: queda atada al CRM y no
  // sirve desde otro sitio). Por http (desarrollo, CRM y panel en localhost) alcanza con Lax.
  partes.push(...(req.secure ? ['Secure', 'SameSite=None', 'Partitioned'] : ['SameSite=Lax']))
  res.setHeader('Set-Cookie', partes.join('; '))
}

/* ---------------- Supabase ---------------- */

async function supabase(ruta, { token, esquema } = {}) {
  const headers = {
    apikey: token ? SUPABASE_ANON_KEY : SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${token || SUPABASE_SERVICE_ROLE_KEY}`,
  }
  if (esquema) headers['Accept-Profile'] = esquema
  const res = await fetch(`${SUPABASE_URL}${ruta}`, { headers, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw Object.assign(new Error(`Supabase respondió ${res.status}`), { status: res.status })
  return res.json()
}

const fichas = new Map() // id → { ts, usuario | null }

/**
 * Ficha del usuario en el CRM. null si no existe, está inactivo o su rol quedó afuera
 * de WHATSAPP_ROLES (vacío: entran todos).
 */
async function fichaUsuario(id) {
  const guardada = fichas.get(id)
  if (guardada && Date.now() - guardada.ts < CACHE_MS) return guardada.usuario
  const [fila] = await supabase(
    `/rest/v1/usuarios?id=eq.${encodeURIComponent(id)}&select=id,usuario,nombre,rol,activo`,
    { esquema: 'crm' },
  )
  let usuario = null
  if (fila?.activo && (!ROLES_WHATSAPP.length || ROLES_WHATSAPP.includes(fila.rol))) {
    usuario = {
      id: fila.id,
      nombre: fila.nombre || fila.usuario || 'Sin nombre',
      rol: fila.rol,
    }
  }
  fichas.set(id, { ts: Date.now(), usuario })
  return usuario
}

/* ---------------- Rutas y middleware ---------------- */

const noAutorizado = (res, mensaje) =>
  res.status(401).json({ error: mensaje, login: true, crmUrl: CRM_URL || null })

/** POST /api/sesion { token }: canjea el token del CRM por la cookie del panel. */
export async function iniciarSesion(req, res) {
  if (!LOGIN_CONFIGURADO) return res.json({ usuario: null, login: false })
  const token = String(req.body?.token || '')
  if (!token) return noAutorizado(res, 'Falta el token del CRM')
  try {
    const user = await supabase('/auth/v1/user', { token })
    const usuario = await fichaUsuario(user.id)
    if (!usuario) return res.status(403).json({ error: 'Tu usuario del CRM no tiene acceso al WhatsApp. Pedíselo a un administrador.' })
    ponerCookie(req, res, crearCookie(usuario.id), SESION_HORAS * 3600)
    res.json({ usuario, login: true })
  } catch (err) {
    if (err.status === 401 || err.status === 403) return noAutorizado(res, 'La sesión del CRM venció. Volvé a abrir el WhatsApp desde el CRM.')
    res.status(502).json({ error: `No se pudo verificar la sesión con el CRM: ${err.message}` })
  }
}

/** POST /api/sesion/salir */
export function cerrarSesion(req, res) {
  ponerCookie(req, res, '', 0)
  res.json({ ok: true })
}

/**
 * Exige sesión en todo /api salvo el canje de sesión. Sin login configurado deja pasar
 * (el servidor solo arranca así si escucha únicamente en esta PC).
 */
export async function exigirSesion(req, res, next) {
  if (!PIDE_SESION) return contexto.run({ usuario: null }, next)
  const id = leerCookie(cookieDe(req))
  if (!id) return noAutorizado(res, 'Entrá al WhatsApp desde el CRM.')
  let usuario
  try {
    usuario = await fichaUsuario(id)
  } catch (err) {
    return res.status(502).json({ error: `No se pudo verificar tu usuario con el CRM: ${err.message}` })
  }
  if (!usuario) {
    ponerCookie(req, res, '', 0)
    return res.status(403).json({ error: 'Tu usuario ya no tiene acceso al WhatsApp.', login: true, crmUrl: CRM_URL || null })
  }
  req.usuario = usuario
  contexto.run({ usuario }, next)
}


/** GET /api/sesion: quién está usando el panel. */
export const sesionActual = (req) => ({ usuario: req.usuario || null, login: PIDE_SESION })

/**
 * Freno contra pedidos armados desde otro sitio: como la cookie también viaja dentro del
 * CRM, todo lo que cambia algo tiene que traer esta cabecera. Un formulario o un link de
 * otro sitio no la puede poner (el navegador pediría permiso y el servidor no lo da).
 */
export function exigirCabecera(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.get('x-nf-wa') === '1') return next()
  res.status(403).json({ error: 'Pedido rechazado' })
}
