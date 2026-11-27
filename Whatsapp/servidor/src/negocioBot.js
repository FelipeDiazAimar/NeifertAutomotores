/*
 * Datos del negocio para el bot (la IA los consulta con la herramienta consultar_negocio): dirección,
 * horarios, teléfonos y categorías. Salen de lo que se edita en la página (Admin → Contenido → Redes y
 * contacto), así hay una sola fuente y no hace falta repetirlos en el texto del asistente.
 * Sin dependencias: se prueba sola.
 */

// Lo mismo que trae la página por defecto (src/store/useSiteStore.js), para cuando todavía no se guardó nada.
const POR_DEFECTO = {
  address: 'Av. Urquiza 898, San Francisco, Córdoba',
  hours: 'Lun a Vie · 8 a 12:30 h y 16 a 20 h · Sáb 9 a 13 h',
  phone: '(03564) 43-5199',
  email: 'neifertsanfrancisco@gmail.com',
  whatsappPhone: '543564562413',
  instagram: 'https://www.instagram.com/neifertautomotores',
  facebook: 'https://www.facebook.com/neifertautomotores',
}
const CATEGORIAS_POR_DEFECTO = ['SUVs', 'Sedanes', 'Coupé', 'Sport', 'Eléctricos', 'Pickups']

const texto = (v) => String(v ?? '').trim()

/**
 * @param {{ socials?: object, categories?: { label: string }[] }} contenido  las filas de contenido_sitio
 * @param {string} web  dirección de la página (https://...), o ''
 */
export function armarNegocio({ socials, categories } = {}, web = '') {
  const s = { ...POR_DEFECTO }
  for (const [clave, valor] of Object.entries(socials && typeof socials === 'object' ? socials : {})) if (texto(valor)) s[clave] = texto(valor)
  const categorias = (Array.isArray(categories) ? categories : []).map((c) => texto(c?.label)).filter(Boolean)
  const whatsapp = s.whatsappPhone.replace(/\D/g, '')
  return {
    nombre: 'Neifert Automotores',
    direccion: s.address,
    mapa: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`,
    horarios: s.hours,
    nota_horarios: 'Son los horarios de atención en el salón. Los días y horas que no figuran, el salón está cerrado.',
    telefono: s.phone,
    whatsapp: whatsapp ? `+${whatsapp}` : '',
    email: s.email,
    web,
    instagram: s.instagram,
    facebook: s.facebook,
    categorias: categorias.length ? categorias : CATEGORIAS_POR_DEFECTO,
    // Lo carga el negocio en Admin → Contenido → Redes y contacto → "Información para el asistente". Sin cargar no se
    // manda: la IA no tiene que inventar condiciones de financiación ni de toma de usados.
    ...(texto(s.financing) ? { financiacion: texto(s.financing) } : {}),
    ...(texto(s.tradeIn) ? { permuta: texto(s.tradeIn) } : {}),
  }
}

/* ===== ¿Está abierto el salón? =====
 * Los horarios son un texto libre que edita el negocio ("Lun a Vie · 8 a 12 h y 15:30 a 19:30 h · Sáb 9 a 13 h"). Acá se
 * interpretan para poder contestar "¿atienden mañana a las 10?" con un sí o un no, sin que la IA adivine. */
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const sinTildes = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
const PREFIJOS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']
const RE_DIA = /\b(dom|lun|mar|mie|jue|vie|sab)[a-z]*/g
const RE_TRAMO = /(\d{1,2})(?::(\d{2}))?\s*(?:h|hs|horas)?\s*(?:a|-|–|hasta)\s*(\d{1,2})(?::(\d{2}))?/g

/** El texto de horarios como { 0..6: [[desde, hasta] en horas decimales] }, o null si no se entiende. */
export function interpretarHorarios(texto) {
  const t = sinTildes(texto)
  // Los días y las horas, en el orden en que están escritos. Un grupo nuevo empieza cuando aparece un día después de haber visto horas.
  const piezas = [
    ...[...t.matchAll(RE_DIA)].map((m) => ({ tipo: 'dia', i: m.index, fin: m.index + m[0].length, d: PREFIJOS.indexOf(m[1]) })),
    ...[...t.matchAll(RE_TRAMO)].map((m) => ({ tipo: 'tramo', i: m.index, fin: m.index + m[0].length, v: [Number(m[1]) + Number(m[2] || 0) / 60, Number(m[3]) + Number(m[4] || 0) / 60] })),
  ].sort((a, b) => a.i - b.i)
  const grupos = []
  let actual = null
  for (const p of piezas) {
    if (p.tipo === 'dia') {
      if (!actual || actual.tramos.length) grupos.push((actual = { dias: [], tramos: [] }))
      actual.dias.push(p)
    } else if (actual) actual.tramos.push(p.v)
  }
  const semana = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }
  let alguno = false
  for (const g of grupos) {
    const lista = []
    // "Lun a Vie" es un rango; "Lun, Mie y Vie", una lista.
    const entre = g.dias.length === 2 ? t.slice(g.dias[0].fin, g.dias[1].i) : ''
    if (g.dias.length === 2 && /\ba\b|-|–|hasta/.test(entre) && !/,|\by\b/.test(entre)) {
      for (let d = g.dias[0].d; ; d = (d + 1) % 7) { lista.push(d); if (d === g.dias[1].d) break }
    } else lista.push(...g.dias.map((x) => x.d))
    const tramos = g.tramos.filter(([a, b]) => b > a && b <= 24)
    for (const d of lista) {
      semana[d] = tramos
      alguno = true
    }
  }
  return alguno ? semana : null
}

const hhmm = (h) => `${Math.floor(h)}${h % 1 ? ':' + String(Math.round((h % 1) * 60)).padStart(2, '0') : ''}`
const tramosEscritos = (tramos) => (tramos.length ? tramos.map(([a, b]) => `${hhmm(a)} a ${hhmm(b)} h`).join(' y ') : 'cerrado')
const AR_MS = 3 * 3600 * 1000 // Argentina, UTC-3 fijo

/**
 * ¿Está abierto el salón ese día y a esa hora? `dia`: hoy, mañana, pasado mañana, un día de la semana (el próximo que viene)
 * o una fecha (2026-11-28, 28/11). `hora`: "10:00", "10", "a las 10:30" (sin hora: solo cuenta el horario del día).
 * `ahora` es ms desde 1970 (para probar). Nunca tira: si no entiende el día o los horarios, lo dice.
 */
export function estaAbierto(textoHorarios, { dia, hora } = {}, ahora = Date.now()) {
  const semana = interpretarHorarios(textoHorarios)
  if (!semana) return { error: 'horario_no_interpretable', horarios: String(textoHorarios || ''), nota: 'No se pudo interpretar el horario: pasale al cliente el texto de los horarios tal cual.' }
  const hoy = new Date(ahora - AR_MS)
  const base = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  const d = sinTildes(dia).trim()
  let fecha = null
  let m
  if (!d || d === 'hoy') fecha = base
  else if (d === 'manana') fecha = base + 86400000
  else if (d.includes('pasado')) fecha = base + 2 * 86400000
  else if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d))) fecha = Date.UTC(+m[1], +m[2] - 1, +m[3])
  else if ((m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(d))) {
    let anio = m[3] ? +m[3] : hoy.getUTCFullYear()
    if (anio < 100) anio += 2000
    fecha = Date.UTC(anio, +m[2] - 1, +m[1])
    if (!m[3] && fecha < base) fecha = Date.UTC(anio + 1, +m[2] - 1, +m[1])
  } else {
    const i = PREFIJOS.indexOf(d.slice(0, 3))
    if (i >= 0) fecha = base + ((i - hoy.getUTCDay() + 7) % 7) * 86400000
  }
  if (fecha === null || Number.isNaN(fecha)) return { error: 'dia_invalido', nota: 'El día tiene que ser hoy, mañana, pasado mañana, un día de la semana o una fecha.' }
  const f = new Date(fecha)
  const tramos = semana[f.getUTCDay()]
  const salida = {
    fecha: f.toISOString().slice(0, 10),
    dia: DIAS[f.getUTCDay()],
    horario_del_dia: tramosEscritos(tramos),
    horarios: String(textoHorarios),
  }
  const hm = /(\d{1,2})(?::(\d{2}))?/.exec(String(hora ?? ''))
  if (hm) {
    const h = Number(hm[1]) + Number(hm[2] || 0) / 60
    if (h >= 24) return { error: 'hora_invalida', nota: 'La hora tiene que ser entre 0 y 23:59.' }
    salida.hora = `${String(hm[1]).padStart(2, '0')}:${hm[2] || '00'}`
    salida.abierto = tramos.some(([a, b]) => h >= a && h < b)
  } else salida.abierto = tramos.length > 0
  if (!salida.abierto) {
    // La próxima vez que abre desde ese momento.
    const desde = hm ? Number(hm[1]) + Number(hm[2] || 0) / 60 : 24
    for (let i = 0; i < 8; i++) {
      const g = new Date(fecha + i * 86400000)
      const siguiente = semana[g.getUTCDay()].find(([a]) => i > 0 || a > desde)
      if (siguiente) { salida.proxima_apertura = `${DIAS[g.getUTCDay()]} ${hhmm(siguiente[0])} h`; break }
    }
  }
  return salida
}
