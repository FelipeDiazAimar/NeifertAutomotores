/*
 * Respaldo programado de los mensajes: un .zip solo de texto (el mismo de GET /api/exportar
 * sin archivos; las fotos, audios y videos ya viven en R2), cifrado con WA_BACKUP_CLAVE,
 * en R2 como respaldo/mensajes/AAAA-MM-DD.enc. Quedan los últimos 15.
 *
 * Apenas se guarda se vuelve a bajar, se descifra y se lee con el mismo código que usa
 * "Importar respaldo" (sin escribir nada): si la cantidad de chats y mensajes no coincide
 * con lo exportado, el respaldo NO cuenta como bueno. Así hay prueba de que se puede importar.
 *
 * Cada hora se revisa: si el último bueno tiene más de WA_RESPALDO_MENSAJES_DIAS (2) se
 * hace otro; y si pasaron más de WA_RESPALDO_AVISO_DIAS (3) sin uno bueno, se crea una
 * alerta del CRM para cada admin/dueño (así llega por push, mail y WhatsApp), una vez por día.
 *
 * Se baja y descifra con `npm run restaurar-mensajes` (scripts/restaurar-mensajes.mjs).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BACKUP_CLAVE, LINEA_DIR } from './config.js'
import { respaldoActivo, cifrar, descifrar } from './respaldo.js'
import { guardar, leer, listarArchivos, borrar } from './archivos.js'
import { listarChats, listarMensajes } from './almacen.js'
import { crearZip, nombreArchivo, textoDeChat } from './exportar.js'
import { entradasZip, leerChatTxt } from './importar.js'
import * as crm from './crm.js'
import { log } from './eventos.js'

const PREFIJO = 'respaldo/mensajes/'
const CONSERVAR = 15
const ARCHIVO_ESTADO = path.join(LINEA_DIR, 'respaldo-mensajes.json')
const DIA_MS = 86400e3
const dias = (valor, porDefecto) => (Number(valor) > 0 ? Number(valor) : porDefecto)
const CADA_DIAS = () => dias(process.env.WA_RESPALDO_MENSAJES_DIAS, 2)
const AVISO_DIAS = () => dias(process.env.WA_RESPALDO_AVISO_DIAS, 3)

export const claveDeDia = (dia) => `${PREFIJO}${dia}.enc`
// Argentina es UTC-3 todo el año (sin horario de verano), como en alertas.js.
const enArgentina = (ahora) => new Date(ahora.getTime() - 3 * 3600e3).toISOString()

const ESTADO_VACIO = { ultimoOk: null, ultimoIntento: null, ultimoAviso: null, verificado: false, chats: 0, mensajes: 0, bytes: 0, clave: null, error: null }

export function estadoRespaldoMensajes() {
  try {
    return { ...ESTADO_VACIO, ...JSON.parse(fs.readFileSync(ARCHIVO_ESTADO, 'utf8')) }
  } catch {
    return { ...ESTADO_VACIO }
  }
}

function guardarEstado(cambios) {
  const nuevo = { ...estadoRespaldoMensajes(), ...cambios }
  fs.mkdirSync(path.dirname(ARCHIVO_ESTADO), { recursive: true })
  const tmp = `${ARCHIVO_ESTADO}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(nuevo, null, 1))
  fs.renameSync(tmp, ARCHIVO_ESTADO)
  return nuevo
}

/** Estado para el panel: lo guardado + si el respaldo está activo y si hay uno corriendo. */
export const vistaRespaldoMensajes = (activo = respaldoActivo()) => ({ ...estadoRespaldoMensajes(), activo, corriendo })

/** Lee un .zip ya armado como lo haría "Importar respaldo", sin escribir nada: cuenta chats y mensajes. */
export function contarZip(zip) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-wa-resp-'))
  const archivo = path.join(dir, 'respaldo.zip')
  fs.writeFileSync(archivo, zip)
  const entradas = entradasZip(archivo)
  try {
    const textos = entradas.filter((e) => /\.txt$/i.test(e.ruta))
    const mensajes = textos.reduce((n, e) => n + leerChatTxt(e.leer().toString('utf8')).mensajes.length, 0)
    return { chats: textos.length, mensajes }
  } finally {
    entradas.cerrar()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

let corriendo = false

/**
 * Hace un respaldo, lo verifica y borra los viejos. Devuelve el estado. Si algo falla lo
 * deja anotado (error) y lo tira. `opciones` existe para las pruebas.
 */
export async function respaldarMensajes({ activo = respaldoActivo(), clave = BACKUP_CLAVE, chats = listarChats, mensajesDe = listarMensajes, ahora = new Date() } = {}) {
  if (!activo) throw Object.assign(new Error('El respaldo no está activo: faltan WA_BACKUP_CLAVE o R2.'), { status: 400 })
  if (corriendo) throw Object.assign(new Error('Ya hay un respaldo de mensajes en curso.'), { status: 409 })
  corriendo = true
  const ts = ahora.toISOString()
  try {
    const lista = chats()
    const exportados = lista.map((c) => ({ chat: c, mensajes: mensajesDe(c.id) }))
    // Mismo filtro que textoDeChat: los de sistema sin texto no salen en el .txt.
    const cuantos = exportados.reduce((n, { mensajes }) => n + mensajes.filter((m) => m.tipo !== 'sistema' || m.texto).length, 0)
    const zip = crearZip(exportados.map(({ chat, mensajes }) => ({ nombre: nombreArchivo(chat.nombre, 'txt'), datos: textoDeChat(chat, mensajes) })))
    const cifrado = cifrar(zip, clave)
    const claveR2 = claveDeDia(enArgentina(ahora).slice(0, 10))
    await guardar(claveR2, cifrado, 'application/octet-stream')

    // Prueba: se baja de nuevo, se descifra y se lee como lo haría Importar.
    const bajado = await leer(claveR2)
    if (!bajado) throw new Error('No se pudo volver a leer el respaldo recién guardado')
    const leido = contarZip(descifrar(bajado, clave))
    if (leido.chats !== lista.length || leido.mensajes !== cuantos) {
      throw new Error(`La verificación no coincide: se guardaron ${lista.length} chats y ${cuantos} mensajes, se leyeron ${leido.chats} y ${leido.mensajes}`)
    }

    // Quedan los últimos CONSERVAR (los nombres llevan la fecha: ordenan solos).
    const viejos = (await listarArchivos(PREFIJO)).map((a) => a.clave).filter((c) => /\d{4}-\d{2}-\d{2}\.enc$/.test(c)).sort().reverse().slice(CONSERVAR)
    for (const c of viejos) await borrar(c).catch(() => {})

    log('ok', 'Respaldo de mensajes', `${leido.chats} chats · ${leido.mensajes} mensajes · verificado`)
    return guardarEstado({ ultimoOk: ts, ultimoIntento: ts, verificado: true, chats: leido.chats, mensajes: leido.mensajes, bytes: cifrado.length, clave: claveR2, error: null })
  } catch (err) {
    guardarEstado({ ultimoIntento: ts, verificado: false, error: err.message })
    throw err
  } finally {
    corriendo = false
  }
}

/** Una alerta del CRM por cada admin/dueño activo (el CRM la manda por push, mail y WhatsApp). */
async function avisarAtraso(estado, ahora, rest) {
  const [fecha, hora] = [enArgentina(ahora).slice(0, 10), enArgentina(ahora).slice(11, 16)]
  const usuarios = await rest('usuarios?select=id&activo=eq.true&rol=in.(admin,dueno)')
  const ultimo = estado.ultimoOk ? new Date(estado.ultimoOk).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : 'nunca'
  const descripcion = `Último respaldo de mensajes bueno: ${ultimo}.${estado.error ? ` Último error: ${estado.error}` : ''}`
  // Uno que falla no frena a los demás. Si llegó a alguno, no se reintenta en una hora
  // (duplicaría la alerta de los que sí la recibieron); si fallaron todos, sí.
  const envios = await Promise.allSettled(usuarios.map((u) => rest('alertas', { metodo: 'POST', cuerpo: { titulo: 'Respaldo de WhatsApp atrasado', descripcion, fecha, hora, asignado_a: u.id, creado_por: null } })))
  const fallidos = envios.filter((e) => e.status === 'rejected')
  if (usuarios.length && fallidos.length === usuarios.length) throw fallidos[0].reason
  if (fallidos.length) log('aviso', 'No se pudo avisar a todos del respaldo atrasado', fallidos[0].reason?.message || '')
  return usuarios.length - fallidos.length
}

/** Una vuelta: respalda si toca y avisa si hace demasiado que no hay uno bueno. */
export async function revisarRespaldoMensajes({ activo = respaldoActivo(), ahora = new Date(), rest = crm.rest, configurado = crm.CRM_CONFIGURADO, ...opciones } = {}) {
  if (!activo) return null
  let estado = estadoRespaldoMensajes()
  const hace = (iso) => (iso ? ahora - new Date(iso) : Infinity)
  if (!corriendo && hace(estado.ultimoOk) >= CADA_DIAS() * DIA_MS) {
    await respaldarMensajes({ activo, ahora, ...opciones }).catch((err) => log('aviso', 'No se pudo hacer el respaldo de mensajes', err.message))
    estado = estadoRespaldoMensajes()
  }
  if (hace(estado.ultimoOk) > AVISO_DIAS() * DIA_MS && hace(estado.ultimoAviso) >= DIA_MS) {
    log('error', 'Respaldo de mensajes atrasado', `Último bueno: ${estado.ultimoOk || 'nunca'}${estado.error ? ` · ${estado.error}` : ''}`)
    try {
      if (configurado) await avisarAtraso(estado, ahora, rest)
      guardarEstado({ ultimoAviso: ahora.toISOString() })
    } catch (err) {
      // Sin ultimoAviso: en la próxima vuelta (una hora) se reintenta.
      log('aviso', 'No se pudo avisar del respaldo atrasado al CRM', err.message)
    }
  }
  return estadoRespaldoMensajes()
}

let vigilando = false
/** Arranca la revisión (una sola vez): a los 2 minutos de arrancar y después cada hora. */
export function vigilarRespaldoMensajes() {
  if (vigilando) return
  vigilando = true
  const vuelta = () => revisarRespaldoMensajes().catch((err) => log('aviso', 'No se pudo revisar el respaldo de mensajes', err.message))
  setTimeout(vuelta, 2 * 60e3).unref()
  setInterval(vuelta, 3600e3).unref()
}
