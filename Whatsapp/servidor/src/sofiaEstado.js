/*
 * Estado de Sofía (el asistente con IA) para el panel de WhatsApp del CRM: si el bot está conectado, cuánto lleva usado
 * del cupo, cuántas charlas tiene abiertas y el recuento de lo que atendió (clientes, mensajes y caracteres).
 *
 * El bot (otro programa, en esta misma PC) manda un reporte por minuto a /api/bot/estado (src/bot.js). El recuento sale
 * de las charlas de Sofía que ya se guardan acá (src/sofia.js), así que no hay nada que sumar aparte. Lo último que se
 * supo queda en wa.estado (clave sofia_estado): con la PC apagada, el CRM en solo lectura lo muestra igual, avisando que
 * es de hace rato.
 */
import { almacenDeEstado } from './historialRespaldos.js'
import { listarChats, listarMensajes } from './almacen.js'

// Argentina es UTC-3 todo el año (sin horario de verano).
const AR_MS = 3 * 3600e3
const HORAS_CHARLA_MS = 12 * 3600e3 // sin hablar tanto, es otra conversación (igual que el bot)
/** Pasado este tiempo sin reporte, se considera que el bot no está andando. */
export const SIN_SENAL_MS = 3 * 60e3

const diaDe = (ms) => new Date(ms - AR_MS).toISOString().slice(0, 10)
const vacio = () => ({ clientes: 0, conversaciones: 0, mensajesCliente: 0, mensajesSofia: 0, caracteresCliente: 0, caracteresSofia: 0, derivadas: 0 })

/**
 * @param {{ id: string, mensajes: { ts: number, rol: 'cliente'|'bot', texto?: string, derivo?: boolean }[] }[]} chats
 *   `ts` en segundos (como se guardan los mensajes).
 * @returns {{ hoy, mes, total, porDia: { dia: string, clientes: number, mensajes: number }[], desde: number|null }}
 *   cada período: { clientes, conversaciones, mensajesCliente, mensajesSofia, caracteresCliente, caracteresSofia, derivadas }
 */
export function calcularEstadisticas(chats, ahora = Date.now()) {
  const hoyDia = diaDe(ahora)
  const mesDe = hoyDia.slice(0, 7)
  const periodos = { hoy: vacio(), mes: vacio(), total: vacio() }
  const clientes = { hoy: new Set(), mes: new Set(), total: new Set() }
  const dias = new Map() // día → { clientes:Set, mensajes }
  let desde = null

  for (const chat of chats) {
    const lista = [...chat.mensajes].filter((m) => Number.isFinite(m.ts)).sort((a, b) => a.ts - b.ts)
    let anterior = -Infinity
    for (const m of lista) {
      const ms = m.ts * 1000
      desde = desde === null ? ms : Math.min(desde, ms)
      const dia = diaDe(ms)
      const enque = ['total', ...(dia.slice(0, 7) === mesDe ? ['mes'] : []), ...(dia === hoyDia ? ['hoy'] : [])]
      const nuevaConversacion = ms - anterior > HORAS_CHARLA_MS
      anterior = ms
      const largo = String(m.texto || '').length
      for (const p of enque) {
        const r = periodos[p]
        clientes[p].add(chat.id)
        if (nuevaConversacion) r.conversaciones++
        if (m.rol === 'bot') {
          r.mensajesSofia++
          r.caracteresSofia += largo
          if (m.derivo) r.derivadas++
        } else {
          r.mensajesCliente++
          r.caracteresCliente += largo
        }
      }
      if (!dias.has(dia)) dias.set(dia, { clientes: new Set(), mensajes: 0 })
      dias.get(dia).clientes.add(chat.id)
      dias.get(dia).mensajes++
    }
  }
  for (const p of Object.keys(periodos)) periodos[p].clientes = clientes[p].size

  // Los últimos 30 días, aunque no haya habido nada (el gráfico no se saltea días).
  const porDia = []
  for (let i = 29; i >= 0; i--) {
    const dia = diaDe(ahora - i * 86400e3)
    const d = dias.get(dia)
    porDia.push({ dia, clientes: d?.clientes.size || 0, mensajes: d?.mensajes || 0 })
  }
  return { ...periodos, porDia, desde }
}

/** Qué decir de la conexión del bot según su último reporte. */
export function conexionDe(reporte, ahora = Date.now()) {
  if (!reporte) return { estado: 'nunca', respondiendo: false }
  const edad = ahora - (reporte.recibidoEn || 0)
  if (edad > SIN_SENAL_MS) return { estado: 'sin_senal', respondiendo: false, hace: edad }
  if (!reporte.vinculado) return { estado: 'sin_numero', respondiendo: false, hace: edad }
  if (!reporte.conectado) return { estado: 'desconectado', respondiendo: false, hace: edad }
  if (!reporte.activo) return { estado: 'apagado', respondiendo: false, hace: edad }
  // Conectado y prendido: contesta salvo cuando está el horario de atención (ahí atienden personas).
  return { estado: 'conectado', respondiendo: !reporte.horario?.dentro, hace: edad }
}

const numero = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null)
const texto = (v, max) => String(v ?? '').slice(0, max)

/** Lo que manda el bot, limpio y con topes (viene de otro programa: no se guarda nada que no se conozca). */
export function limpiarReporte(r = {}) {
  return {
    asistente: texto(r.asistente, 60) || 'Asistente',
    vinculado: !!r.vinculado,
    numeroPropio: !!r.numeroPropio,
    iniciado: !!r.iniciado,
    conectado: !!r.conectado,
    activo: !!r.activo,
    horario: { activo: !!r.horario?.activo, texto: texto(r.horario?.texto, 200), dentro: !!r.horario?.dentro },
    atendiendo: Math.max(0, Math.trunc(numero(r.atendiendo) ?? 0)),
    ia: r.ia && typeof r.ia === 'object' && numero(r.ia.cupo) !== null ? { usadas: numero(r.ia.usadas) ?? 0, cupo: numero(r.ia.cupo), porMinuto: numero(r.ia.porMinuto), mes: texto(r.ia.mes, 7) || null } : null,
    ultimaRespuestaTs: numero(r.ultimaRespuestaTs),
    ultimaFalla: r.ultimaFalla ? { ts: numero(r.ultimaFalla.ts), que: texto(r.ultimaFalla.que, 200) } : null,
    version: texto(r.version, 20),
  }
}

let ultimo = null // { reporte, recibidoEn }
let cache = { ts: 0, datos: null }
const almacen = almacenDeEstado('sofia_estado')

/** Las charlas de Sofía que hay guardadas, como las pide calcularEstadisticas. */
function charlasDeSofia() {
  return listarChats()
    .filter((c) => c.sofiaTs)
    .map((c) => ({
      id: c.id,
      mensajes: listarMensajes(c.id, { conSofia: true })
        .filter((m) => m.sofia)
        .map((m) => ({ ts: m.ts, rol: m.sofia.rol, texto: m.texto, derivo: !!m.sofia.derivo })),
    }))
}

/** Estadísticas al día (se calculan a lo sumo cada 30 s). */
export function estadisticasActuales(ahora = Date.now(), fuente = charlasDeSofia) {
  if (cache.datos && ahora - cache.ts < 30_000) return cache.datos
  cache = { ts: ahora, datos: calcularEstadisticas(fuente(), ahora) }
  return cache.datos
}

/** Guarda el reporte del bot (una vez por minuto) y deja lo último que se supo en la base para el CRM sin conexión. */
export async function guardarReporte(crudo, ahora = Date.now()) {
  ultimo = { ...limpiarReporte(crudo), recibidoEn: ahora }
  try {
    await almacen.guardar({ reporte: ultimo, estadisticas: estadisticasActuales(ahora), actualizadoEn: ahora })
  } catch {
    /* el panel igual lo ve en vivo; solo no queda para cuando la PC esté apagada */
  }
  return { ok: true }
}

/** Lo que ve el panel. Sin reporte en memoria (el servidor recién arrancó) se usa lo último guardado. */
export async function vistaSofia(ahora = Date.now()) {
  let reporte = ultimo
  let estadisticas = estadisticasActuales(ahora)
  if (!reporte) {
    const guardado = await almacen.leer().catch(() => null)
    reporte = guardado?.reporte || null
    if (!estadisticas.total.mensajesSofia && guardado?.estadisticas) estadisticas = guardado.estadisticas
  }
  return { conexion: conexionDe(reporte, ahora), reporte, estadisticas, ahora }
}

/** Solo para las pruebas. */
export const _reiniciar = () => {
  ultimo = null
  cache = { ts: 0, datos: null }
}
