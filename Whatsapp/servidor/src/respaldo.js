/*
 * Respaldo de la sesión de WhatsApp (data/sesion) y de los .env, cifrado, en R2.
 *
 * La sesión es la llave de la línea: sin ella, una PC nueva tiene que volver a escanear
 * el QR. Se respalda cada vez que cambia (agrupado) y cada 6 horas; los .env, al arrancar
 * y una vez por día. Todo va cifrado con AES-256-GCM y una clave derivada de
 * WA_BACKUP_CLAVE (scrypt): sin esa clave el respaldo no sirve, así que la clave NO va
 * en el respaldo, va en un gestor de contraseñas.
 *
 *   respaldo/sesion.enc                 el último
 *   respaldo/historial/sesion-AAAA-MM-DD.enc  uno por día, 14 días
 *   respaldo/env.enc                    Whatsapp/servidor/.env y el .env del proyecto
 *
 * Se restaura con `npm run restaurar` (scripts/restaurar.mjs).
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { ARCHIVOS_EN_R2, ARCHIVOS_ENV, BACKUP_CLAVE } from './config.js'
import { guardar, leer, listarArchivos, borrar } from './archivos.js'

const MAGIA = Buffer.from('NFWA1')
export const CLAVE_SESION = 'respaldo/sesion.enc'
export const CLAVE_ENV = 'respaldo/env.enc'
const HISTORIAL = 'respaldo/historial/'
const DIAS_HISTORIAL = 14

export const respaldoActivo = () => Boolean(BACKUP_CLAVE && ARCHIVOS_EN_R2)

/* ---------------- Cifrado ---------------- */

export function cifrar(datos, clave) {
  const sal = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const llave = crypto.scryptSync(clave, sal, 32)
  const c = crypto.createCipheriv('aes-256-gcm', llave, iv)
  const cuerpo = Buffer.concat([c.update(datos), c.final()])
  return Buffer.concat([MAGIA, sal, iv, c.getAuthTag(), cuerpo])
}

export function descifrar(paquete, clave) {
  if (!paquete.subarray(0, MAGIA.length).equals(MAGIA)) throw new Error('No es un respaldo de WhatsApp Neifert')
  let i = MAGIA.length
  const sal = paquete.subarray(i, (i += 16))
  const iv = paquete.subarray(i, (i += 12))
  const tag = paquete.subarray(i, (i += 16))
  const d = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(clave, sal, 32), iv)
  d.setAuthTag(tag)
  try {
    return Buffer.concat([d.update(paquete.subarray(i)), d.final()])
  } catch {
    throw new Error('La clave no es la correcta (o el respaldo está dañado)')
  }
}

/* ---------------- Empaquetado ---------------- */

/** Carpeta → { nombre: base64 } comprimido. */
export function empaquetarCarpeta(dir) {
  const archivos = {}
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isFile()) archivos[f] = fs.readFileSync(p).toString('base64')
  }
  return zlib.gzipSync(JSON.stringify({ tipo: 'carpeta', creado: new Date().toISOString(), archivos }))
}

export function desempaquetar(datos) {
  return JSON.parse(zlib.gunzipSync(datos).toString('utf8'))
}

/* ---------------- Respaldar ---------------- */

const hoy = () => new Date().toISOString().slice(0, 10)

/** Respalda la carpeta de la sesión. Devuelve { bytes, archivos } o null si no hay nada que respaldar. */
export async function respaldarSesion(authDir) {
  if (!respaldoActivo() || !fs.existsSync(path.join(authDir, 'creds.json'))) return null
  const paquete = empaquetarCarpeta(authDir)
  const cifrado = cifrar(paquete, BACKUP_CLAVE)
  await guardar(CLAVE_SESION, cifrado, 'application/octet-stream')
  await guardar(`${HISTORIAL}sesion-${hoy()}.enc`, cifrado, 'application/octet-stream')
  // Del historial quedan los últimos DIAS_HISTORIAL días.
  const limite = new Date(Date.now() - DIAS_HISTORIAL * 86400e3).toISOString().slice(0, 10)
  for (const { clave } of await listarArchivos(HISTORIAL)) {
    const m = /sesion-(\d{4}-\d{2}-\d{2})\.enc$/.exec(clave)
    if (m && m[1] < limite) await borrar(clave).catch(() => {})
  }
  return { bytes: cifrado.length, archivos: fs.readdirSync(authDir).length }
}

/** Respalda los dos .env (el del servidor y el del proyecto, con las claves de Supabase y R2). */
export async function respaldarEnv() {
  if (!respaldoActivo()) return null
  const [servidor, proyecto] = ARCHIVOS_ENV.map((f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null))
  const paquete = zlib.gzipSync(JSON.stringify({ tipo: 'env', creado: new Date().toISOString(), servidor, proyecto }))
  await guardar(CLAVE_ENV, cifrar(paquete, BACKUP_CLAVE), 'application/octet-stream')
  return { servidor: !!servidor, proyecto: !!proyecto }
}

/** Baja y descifra un respaldo. `clave` es la clave de R2 (CLAVE_SESION, CLAVE_ENV o una del historial). */
export async function bajarRespaldo(claveR2, clave = BACKUP_CLAVE) {
  const datos = await leer(claveR2)
  if (!datos) return null
  return desempaquetar(descifrar(datos, clave))
}
