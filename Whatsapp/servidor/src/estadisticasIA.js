/*
 * Cuántas consultas llegan fuera de horario, para saber si alcanza el cupo del asistente con IA (Sofía):
 * contesta solo fuera del horario de atención, así que lo que cuenta son los mensajes que entran cuando el salón
 * está cerrado. Sin dependencias: se prueba solo; lo corre scripts/estadisticas-fuera-de-horario.mjs.
 *
 * "Respuesta" = una ráfaga: el bot junta los mensajes seguidos de un mismo contacto (unos segundos de espera) y
 * contesta una vez. Cada respuesta descuenta 1 del cupo mensual de la licencia (aunque la IA haga una consulta
 * al CRM en el medio) y suma 1 o 2 llamadas al modelo.
 */

// Argentina es UTC-3 todo el año (sin horario de verano).
const AR_MS = 3 * 3600e3

/** Horario de atención al público de Neifert (de la página): { díaDeLaSemana(0=domingo): [[desde, hasta], ...] } en horas. */
export const HORARIO_NEIFERT = {
  0: [],
  1: [[8, 12.5], [16, 20]],
  2: [[8, 12.5], [16, 20]],
  3: [[8, 12.5], [16, 20]],
  4: [[8, 12.5], [16, 20]],
  5: [[8, 12.5], [16, 20]],
  6: [[9, 13]],
}

/** La consulta que baja los mensajes entrantes (de contactos, no grupos) de una línea. */
export const CONSULTA_ENTRANTES = `
  select m.chat_jid, m.ts
    from wa.mensajes m
   where m.linea = $1
     and not m.de_mi
     and m.ts >= now() - ($2::int * interval '1 day')
     and m.chat_jid not like '%@g.us'
     and m.tipo <> 'sistema'
   order by m.chat_jid, m.ts`

const local = (ms) => new Date(ms - AR_MS) // los getUTC* de esta fecha son la hora de Argentina
const pad = (n) => String(n).padStart(2, '0')

/** ¿El salón está abierto en ese momento (ms desde 1970)? */
export function dentroDeHorario(ms, horario = HORARIO_NEIFERT) {
  const d = local(ms)
  const hora = d.getUTCHours() + d.getUTCMinutes() / 60
  return (horario[d.getUTCDay()] || []).some(([desde, hasta]) => hora >= desde && hora < hasta)
}

const maximo = (mapa) => {
  let mejor = { clave: null, n: 0 }
  for (const [clave, n] of mapa) if (n > mejor.n) mejor = { clave, n }
  return mejor
}
const sumar = (mapa, clave, n = 1) => mapa.set(clave, (mapa.get(clave) || 0) + n)

/**
 * @param {{ chat: string, ts: number|Date|string }[]} entrantes  mensajes que llegaron (no los de la línea)
 * @param {{ horario?: object, esperaS?: number, sesionH?: number, dias?: number }} opciones
 *   esperaS: segundos entre mensajes para que cuenten como una misma ráfaga (el bot espera unos segundos)
 *   sesionH: horas sin hablar para que sea otra conversación (el asistente retoma la charla hasta 12 h)
 *   dias: cuántos días abarca el análisis (para promediar por mes y por día)
 */
export function calcular(entrantes, { horario = HORARIO_NEIFERT, esperaS = 90, sesionH = 12, dias = 0 } = {}) {
  const porChat = new Map()
  for (const m of entrantes) {
    const ms = new Date(m.ts).getTime()
    if (!Number.isFinite(ms)) continue
    if (!porChat.has(m.chat)) porChat.set(m.chat, [])
    porChat.get(m.chat).push(ms)
  }

  const r = {
    mensajes: 0,
    mensajesFuera: 0,
    rafagas: 0,
    rafagasFuera: 0,
    conversaciones: 0,
    conversacionesFuera: 0,
    contactosFuera: new Set(),
    porMes: new Map(),
    porDia: new Map(),
    porHora: new Map(),
    porMinuto: new Map(),
  }

  for (const [chat, lista] of porChat) {
    lista.sort((a, b) => a - b)
    let anterior = -Infinity
    let anteriorRafaga = -Infinity
    for (const ms of lista) {
      const fuera = !dentroDeHorario(ms, horario)
      r.mensajes++
      if (fuera) r.mensajesFuera++
      // Una conversación nueva: pasó mucho desde el último mensaje de ese contacto.
      if (ms - anterior > sesionH * 3600e3) {
        r.conversaciones++
        if (fuera) r.conversacionesFuera++
      }
      // Una ráfaga nueva: pasó más de la espera del bot desde el mensaje anterior. Se cuenta cuando arranca.
      if (ms - anteriorRafaga > esperaS * 1000) {
        r.rafagas++
        if (fuera) {
          r.rafagasFuera++
          r.contactosFuera.add(chat)
          const d = local(ms)
          const dia = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
          sumar(r.porMes, dia.slice(0, 7))
          sumar(r.porDia, dia)
          sumar(r.porHora, `${dia} ${pad(d.getUTCHours())}h`)
          sumar(r.porMinuto, `${dia} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`)
        }
      }
      anterior = ms
      anteriorRafaga = ms
    }
  }

  const meses = [...r.porMes.values()]
  const diasConRespuestas = r.porDia.size
  return {
    mensajes: r.mensajes,
    mensajesFuera: r.mensajesFuera,
    rafagas: r.rafagas,
    respuestasFuera: r.rafagasFuera,
    conversaciones: r.conversaciones,
    conversacionesFuera: r.conversacionesFuera,
    contactosFuera: r.contactosFuera.size,
    porMes: Object.fromEntries([...r.porMes].sort()),
    mesMasCargado: maximo(r.porMes),
    diaMasCargado: maximo(r.porDia),
    horaMasCargada: maximo(r.porHora),
    minutoMasCargado: maximo(r.porMinuto),
    // Promedio por mes calendario completo de 30 días (si se pasó `dias`, sobre todo el período; si no, sobre los meses con datos).
    respuestasPorMes: dias ? (r.rafagasFuera / dias) * 30 : meses.length ? meses.reduce((a, b) => a + b, 0) / meses.length : 0,
    respuestasPorDiaConDatos: diasConRespuestas ? r.rafagasFuera / diasConRespuestas : 0,
  }
}

/** Lo que se ve en pantalla: el resultado de calcular() frente al cupo del servidor de licencias y al tope por minuto. */
export function informe(s, { cupoMensual = 1500, porMinuto = 20, dias = 0, llamadasPorRespuesta = [1, 2] } = {}) {
  const n = (v) => Math.round(v).toLocaleString('es-AR')
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—')
  const peor = s.mesMasCargado.n
  const [llamMin, llamMax] = llamadasPorRespuesta
  return [
    `Período analizado: ${dias ? `${dias} días` : 'todo lo cargado'}.`,
    `Mensajes que entraron: ${n(s.mensajes)} · fuera de horario: ${n(s.mensajesFuera)} (${pct(s.mensajesFuera, s.mensajes)}).`,
    `Conversaciones nuevas fuera de horario: ${n(s.conversacionesFuera)} · contactos distintos que escribieron fuera de horario: ${n(s.contactosFuera)}.`,
    `Respuestas del asistente (una por ráfaga de mensajes): ${n(s.respuestasFuera)} en total.`,
    `  · promedio: ${n(s.respuestasPorMes)} por mes → ${pct(s.respuestasPorMes, cupoMensual)} del cupo mensual (${n(cupoMensual)}).`,
    `  · mes más cargado: ${s.mesMasCargado.clave || '—'} con ${n(peor)} → ${pct(peor, cupoMensual)} del cupo.`,
    `  · día más cargado: ${s.diaMasCargado.clave || '—'} con ${n(s.diaMasCargado.n)}; hora más cargada: ${s.horaMasCargada.clave || '—'} con ${n(s.horaMasCargada.n)}.`,
    `  · pico en un minuto: ${s.minutoMasCargado.clave || '—'} con ${n(s.minutoMasCargado.n)} (tope por minuto de la licencia: ${n(porMinuto)}).`,
    `Llamadas al modelo (${llamMin} a ${llamMax} por respuesta): ${n(s.respuestasPorMes * llamMin)} a ${n(s.respuestasPorMes * llamMax)} por mes en promedio.`,
    `Alcanza el cupo: ${peor <= cupoMensual ? 'sí, incluso en el mes más cargado' : 'NO en el mes más cargado: hay que subir IA_CUPO_MENSUAL'}.`,
  ].join('\n')
}
