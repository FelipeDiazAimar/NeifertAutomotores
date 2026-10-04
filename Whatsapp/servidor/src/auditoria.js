/*
 * Registro de auditoría: quién hizo qué en el panel, cuándo y desde qué IP. Va a la tabla
 * wa.auditoria (supabase/whatsapp_v2_auditoria.sql). Si la base no responde, o en modo
 * local, queda en data/auditoria.jsonl, así no se pierde nada; lo que quedó ahí se sube
 * solo la próxima vez que la base responda.
 *
 * Nunca frena al pedido que lo dispara: si no se puede escribir, se anota y sigue.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ALMACEN, DATA_DIR, DETRAS_DE_PROXY } from './config.js'
import { consultar } from './nube.js'

const PENDIENTE = path.join(DATA_DIR, 'auditoria.jsonl')
const EN_BASE = ALMACEN === 'supabase'

const SQL = `insert into wa.auditoria (ts, usuario_id, usuario_nombre, rol, accion, resultado, chat_jid, detalle, ip)
  select ts, usuario_id, usuario_nombre, rol, accion, resultado, chat_jid, detalle, ip
    from jsonb_to_recordset($1::jsonb) as x(ts timestamptz, usuario_id text, usuario_nombre text, rol text,
         accion text, resultado text, chat_jid text, detalle jsonb, ip text)`

/** IP de quien hace el pedido. Detrás de un proxy (Cloudflare Tunnel) la informa el proxy. */
export function ipDe(req) {
  if (!req) return null
  if (DETRAS_DE_PROXY) {
    const cf = req.get?.('cf-connecting-ip')
    if (cf) return cf
    const fwd = req.get?.('x-forwarded-for')
    if (fwd) return fwd.split(',')[0].trim()
  }
  return (req.socket?.remoteAddress || '').replace(/^::ffff:/, '') || null
}

function aLocal(filas) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.appendFileSync(PENDIENTE, filas.map((f) => JSON.stringify(f)).join('\n') + '\n')
  } catch (err) {
    console.error(`No se pudo guardar la auditoría: ${err.message}`)
  }
}

let subiendoPendientes = false
/** Sube lo que quedó en el archivo local cuando la base no respondía. */
async function subirPendientes() {
  if (!EN_BASE || subiendoPendientes || !fs.existsSync(PENDIENTE)) return
  subiendoPendientes = true
  const enviando = `${PENDIENTE}.subiendo`
  try {
    fs.renameSync(PENDIENTE, enviando)
    const filas = fs
      .readFileSync(enviando, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l)
        } catch {
          return null
        }
      })
      .filter(Boolean)
    if (filas.length) await consultar(SQL, [JSON.stringify(filas)])
    fs.rmSync(enviando)
  } catch {
    // Sigue sin poder: vuelve al archivo para el próximo intento.
    try {
      if (fs.existsSync(enviando)) {
        fs.appendFileSync(PENDIENTE, fs.readFileSync(enviando))
        fs.rmSync(enviando)
      }
    } catch {}
  } finally {
    subiendoPendientes = false
  }
}

/**
 * Anota una acción. `usuario` es el del pedido ({ id, nombre, rol }) o null si la hizo el
 * propio servidor (por ejemplo, una desvinculación por número equivocado).
 */
export function auditar({ req = null, usuario = req?.usuario || null, accion, resultado = 'ok', chatId = null, detalle = {} }) {
  const fila = {
    ts: new Date().toISOString(),
    usuario_id: usuario?.id || null,
    usuario_nombre: usuario?.nombre || null,
    rol: usuario?.rol || null,
    accion,
    resultado,
    chat_jid: chatId,
    detalle,
    ip: ipDe(req),
  }
  if (!EN_BASE) return aLocal([fila])
  consultar(SQL, [JSON.stringify([fila])])
    .then(() => subirPendientes())
    .catch(() => aLocal([fila]))
}

/** Últimas acciones registradas (para la pestaña Conexión). */
export async function ultimasAcciones(limite = 100) {
  if (!EN_BASE) {
    try {
      return fs.readFileSync(PENDIENTE, 'utf8').split('\n').filter(Boolean).slice(-limite).reverse().map((l) => JSON.parse(l))
    } catch {
      return []
    }
  }
  const { rows } = await consultar(
    'select ts, usuario_nombre, rol, accion, resultado, chat_jid, detalle, ip from wa.auditoria order by ts desc limit $1',
    [limite],
  )
  return rows
}
