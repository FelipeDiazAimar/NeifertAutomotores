/*
 * Respaldo LOCAL: el que alguien baja a mano con "Exportar todos los chats" (todos los chats, con o sin
 * archivos) y guarda en la PC o en un disco. Es distinto del respaldo automático en la nube
 * (respaldoMensajes.js, R2), que si falla solo avisa al admin.
 *
 * Cada vez que una exportación completa termina bien se anota en la base (wa.estado, clave
 * "respaldo_local"): cuándo, quién, cuántos chats y mensajes y hasta qué mensaje llega. Si
 * pasan más de WA_RESPALDO_LOCAL_AVISO_DIAS (3) sin ninguno, se crea una alerta del CRM para
 * admin, dueño y a quienes se hayan marcado en el panel, una vez por día.
 *
 * Los respaldos locales pueden solaparse entre sí (cada uno repite un poco del anterior, a
 * propósito): "Importar respaldo" (importar.js) los junta sin duplicar ni perder mensajes.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ALMACEN, LINEA_DIR } from './config.js'
import { leerEstadoNube, guardarEstadoNube } from './nube.js'
import { destinatariosAviso, avisarUsuarios } from './respaldoMensajes.js'
import * as crm from './crm.js'
import { log } from './eventos.js'

const CLAVE = 'respaldo_local'
const ARCHIVO = path.join(LINEA_DIR, 'respaldo-local.json')
const DIA_MS = 86400e3
const HISTORIAL = 30
const AVISO_DIAS = () => (Number(process.env.WA_RESPALDO_LOCAL_AVISO_DIAS) > 0 ? Number(process.env.WA_RESPALDO_LOCAL_AVISO_DIAS) : 3)

const VACIO = { ultimo: null, vigilarDesde: null, ultimoAviso: null, historial: [] }

/** Dónde se guarda: la base (Supabase) en producción, un archivo de la línea en modo local. */
const almacenPorDefecto = {
  async leer() {
    if (ALMACEN === 'supabase') return leerEstadoNube(CLAVE)
    try {
      return JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'))
    } catch {
      return null
    }
  },
  async guardar(valor) {
    if (ALMACEN === 'supabase') return guardarEstadoNube(CLAVE, valor)
    fs.mkdirSync(path.dirname(ARCHIVO), { recursive: true })
    fs.writeFileSync(ARCHIVO, JSON.stringify(valor, null, 1))
  },
}

const leerTodo = async (almacen) => ({ ...VACIO, ...(await almacen.leer()) })

/** Estado para el panel. */
export async function vistaRespaldoLocal({ almacen = almacenPorDefecto, ahora = new Date() } = {}) {
  const e = await leerTodo(almacen)
  const referencia = e.ultimo || e.vigilarDesde
  const dias = referencia ? (ahora - new Date(referencia)) / DIA_MS : null
  return { ...e, avisoDias: AVISO_DIAS(), atrasado: dias !== null && dias > AVISO_DIAS(), diasSinRespaldo: dias === null ? null : Math.floor(dias) }
}

/**
 * Anota un respaldo local terminado. `datos`: { usuario, chats, mensajes, conArchivos, hasta }
 * (`hasta`: fecha, en segundos, del último mensaje que entró). Nunca tira: si no se puede
 * anotar, el respaldo igual se hizo; solo queda en el registro.
 */
export async function registrarRespaldoLocal(datos, { almacen = almacenPorDefecto, ahora = new Date() } = {}) {
  try {
    const e = await leerTodo(almacen)
    const registro = {
      ts: ahora.toISOString(),
      usuario: String(datos.usuario || '').slice(0, 80) || null,
      chats: datos.chats || 0,
      mensajes: datos.mensajes || 0,
      conArchivos: !!datos.conArchivos,
      hasta: datos.hasta || null,
    }
    await almacen.guardar({ ...e, ultimo: registro.ts, ultimoAviso: null, historial: [registro, ...e.historial].slice(0, HISTORIAL) })
    log('ok', 'Respaldo local registrado', `${registro.chats} chats · ${registro.mensajes} mensajes${registro.usuario ? ` · ${registro.usuario}` : ''}`)
    return registro
  } catch (err) {
    log('aviso', 'No se pudo anotar el respaldo local', err.message)
    return null
  }
}

/**
 * Una vuelta: si hace más de 3 días que no se baja un respaldo local, avisa (una vez por día).
 * Si todavía no hay ninguno anotado, cuenta desde la primera vez que se revisó: no avisa de
 * golpe el día que se instala.
 */
export async function revisarRespaldoLocal({ almacen = almacenPorDefecto, ahora = new Date(), rest = crm.rest, configurado = crm.CRM_CONFIGURADO } = {}) {
  let e = await leerTodo(almacen)
  if (!e.vigilarDesde) {
    e = { ...e, vigilarDesde: ahora.toISOString() }
    await almacen.guardar(e)
  }
  const hace = (iso) => (iso ? ahora - new Date(iso) : Infinity)
  const sinRespaldo = hace(e.ultimo || e.vigilarDesde)
  if (sinRespaldo <= AVISO_DIAS() * DIA_MS || hace(e.ultimoAviso) < DIA_MS) return { avisado: 0 }

  log('error', 'Falta el respaldo local', `Hace ${Math.floor(sinRespaldo / DIA_MS)} días que nadie baja los chats (Exportar todos los chats)`)
  if (!configurado) return { avisado: 0 }
  const ultimo = e.ultimo ? new Date(e.ultimo).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : null
  const descripcion = ultimo
    ? `El último respaldo local de los chats se hizo el ${ultimo}. Bajá uno desde WhatsApp → Conexión → Exportar todos los chats.`
    : 'Todavía no se registró ningún respaldo local de los chats. Bajá uno desde WhatsApp → Conexión → Exportar todos los chats.'
  const usuarios = destinatariosAviso(await rest('usuarios?select=id,rol&activo=eq.true'))
  const avisado = await avisarUsuarios(usuarios, { titulo: `Hace más de ${AVISO_DIAS()} días que no se hace el respaldo local de WhatsApp`, descripcion }, ahora, rest)
  await almacen.guardar({ ...e, ultimoAviso: ahora.toISOString() })
  return { avisado }
}

let vigilando = false
/** Revisa a los 3 minutos de arrancar y después cada hora. */
export function vigilarRespaldoLocal() {
  if (vigilando) return
  vigilando = true
  const vuelta = () => revisarRespaldoLocal().catch((err) => log('aviso', 'No se pudo revisar el respaldo local', err.message))
  setTimeout(vuelta, 3 * 60e3).unref()
  setInterval(vuelta, 3600e3).unref()
}
