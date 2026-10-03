/* Bandeja de WhatsApp de la concesionaria. Habla con el servidor en /api y recibe los cambios en vivo por /api/eventos. */

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const ic = (n) => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const pad = (n) => String(n).padStart(2, '0')
const fmtDur = (s) => `${Math.floor((s || 0) / 60)}:${pad(Math.floor((s || 0) % 60))}`
const fmtNum = (n) => new Intl.NumberFormat('es-AR').format(n || 0)
const domId = (id) => `m-${String(id).replace(/[^\w-]/g, '_')}`
const enc = encodeURIComponent

// Mensajes que se dibujan de a tandas: al subir en la conversación se agregan los anteriores.
const PAGINA = 60
const REACCIONES = ['👍', '❤️', '😂', '😮', '😢', '🙏']
const VELOCIDADES = [1, 1.5, 2]

function leerLocal(clave, porDefecto) {
  try {
    return JSON.parse(localStorage.getItem(clave)) ?? porDefecto
  } catch {
    return porDefecto
  }
}
function guardarLocal(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch {}
}

function fmtBytes(b) {
  if (!b) return '0 KB'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++ }
  return `${b.toFixed(b < 10 && i > 0 ? 1 : 0).replace('.', ',')} ${u[i]}`
}
function hora(ts) {
  const d = new Date(ts * 1000)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
/** Como WhatsApp: Hoy, Ayer, el día de la semana si fue esta semana, o la fecha. */
function diaDe(ts) {
  const d = new Date(ts * 1000)
  const hoy = new Date()
  const dias = Math.round((new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000)
  if (dias <= 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  if (dias < 7) {
    const w = d.toLocaleDateString('es-AR', { weekday: 'long' })
    return w[0].toUpperCase() + w.slice(1)
  }
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}
function horaLista(ts) {
  if (!ts) return ''
  const dia = diaDe(ts)
  if (dia === 'Hoy') return hora(ts)
  if (!dia.includes('/')) return dia
  return dia.slice(0, 6) + dia.slice(8)
}

const state = {
  view: 'inbox', filter: 'todos', q: '', verArchivados: false,
  chats: new Map(), activo: null, mensajes: new Map(),
  visibles: PAGINA, pegadoAbajo: true, nuevosAbajo: 0, sinLeerDesde: null, sinLeerCantidad: 0,
  presencias: new Map(), respondiendo: null, menuBoton: null, velocidades: new Map(),
  conn: { conexion: 'iniciando', qr: null, yo: null }, config: {}, logs: [],
  grabacion: null, composerOff: null, revelados: new Set(), agentes: [],
}
const borradores = new Map(Object.entries(leerLocal('wa-borradores', {})))
const conectado = () => state.conn.conexion === 'conectado'

// Todo pedido lleva esta cabecera: el servidor rechaza los que cambian algo sin ella (ver exigirCabecera).
const CABECERA = { 'X-NF-WA': '1' }

async function api(ruta, { method = 'GET', json, body, headers } = {}) {
  const res = await fetch(ruta, {
    method,
    headers: { ...CABECERA, ...(json ? { 'Content-Type': 'application/json' } : headers) },
    body: json ? JSON.stringify(json) : body,
  })
  const data = await res.json().catch(() => ({}))
  if ((res.status === 401 || res.status === 403) && data.login) pantallaSinSesion(data, res.status)
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
  return data
}

let toastTimer
function toast(texto, ms = 3200) {
  const el = $('#toast')
  el.textContent = texto
  el.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (el.hidden = true), ms)
}

/* ---------------- Formato de WhatsApp ---------------- */

/** *negrita*, _cursiva_, ~tachado~, ```monoespaciado``` y links, sobre texto ya escapado. */
function formatear(texto) {
  const links = []
  let html = esc(texto).replace(/\b(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?]|www\.[^\s<]+[^\s<.,:;"')\]!?])/gi, (url) => {
    links.push(url)
    return `\u0000${links.length - 1}\u0000`
  })
  html = html
    .replace(/```([\s\S]+?)```/g, '<code>$1</code>')
    .replace(/(^|[\s(>])\*(?=\S)([^*\n]*?\S)\*(?=$|[\s.,!?:;)<])/g, '$1<strong>$2</strong>')
    .replace(/(^|[\s(>])_(?=\S)([^_\n]*?\S)_(?=$|[\s.,!?:;)<])/g, '$1<em>$2</em>')
    .replace(/(^|[\s(>])~(?=\S)([^~\n]*?\S)~(?=$|[\s.,!?:;)<])/g, '$1<s>$2</s>')
  // El \u0000 es un centinela propio: marca dónde estaban los links mientras se escapa el
  // resto del texto. No puede aparecer en un mensaje de WhatsApp.
  // eslint-disable-next-line no-control-regex
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => {
    const url = links[i]
    const href = url.startsWith('www.') ? `https://${url}` : url
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`
  })
}

const segmentador = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('es', { granularity: 'grapheme' }) : null
/** Mensajes de 1 a 3 emojis se muestran grandes, como en WhatsApp. */
function soloEmojis(texto) {
  const t = (texto || '').trim()
  if (!t || /[0-9#*a-z]/i.test(t) || !/\p{Extended_Pictographic}/u.test(t)) return false
  // El ZWJ (U+200D) y el selector de variación (U+FE0F) van a propósito: son las piezas
  // con las que WhatsApp arma los emojis compuestos (familias, banderas, tonos de piel).
  // eslint-disable-next-line no-misleading-character-class
  if (!/^[\p{Extended_Pictographic}\p{Emoji_Component}‍️\s]+$/u.test(t)) return false
  const cantidad = segmentador ? [...segmentador.segment(t.replace(/\s/g, ''))].length : t.length
  return cantidad <= 3
}

/* ---------------- Lista de chats ---------------- */

const FILTROS = [
  { id: 'todos', label: 'Todos', test: () => true },
  { id: 'no-leidos', label: 'No leídos', test: (c) => c.noLeidos > 0 },
]
const PREVIA = {
  imagen: ['image', 'Foto'], video: ['video', 'Video'], gif: ['video', 'GIF'], nota_voz: ['mic', 'Nota de voz'],
  audio: ['mic', 'Audio'], documento: ['file', 'Documento'], sticker: ['image', 'Sticker'],
  ubicacion: ['pin', 'Ubicación'], contacto: ['user', 'Contacto'], una_vez: ['clock', 'Para ver una vez'],
}

function iniciales(c) {
  const n = c?.nombre || ''
  if (!n || n.startsWith('+') || /^\d/.test(n)) return ic('user')
  return esc(n.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase())
}
function avatarHtml(c) {
  const foto = c?.foto ? `<img src="/api/chats/${enc(c.id)}/foto?v=${c.foto}" alt="" loading="lazy">` : ''
  return `<span class="avatar" data-jid="${esc(c?.id || '')}">${iniciales(c)}${foto}</span>`
}

function tickHtml(estado) {
  if (estado === 'leido' || estado === 'reproducido') return `<span class="tick read">${ic('checks')}</span>`
  if (estado === 'entregado') return `<span class="tick">${ic('checks')}</span>`
  if (estado === 'enviado') return `<span class="tick">${ic('check')}</span>`
  if (estado === 'pendiente') return `<span class="tick">${ic('clock')}</span>`
  return ''
}

/** "escribiendo…" y "grabando audio…" duran 25 s si WhatsApp no avisa que terminó. */
function actividadDe(chatId) {
  const p = state.presencias.get(chatId)
  if (!p || Date.now() - p.recibido > 25000) return null
  if (p.estado === 'composing') return 'escribiendo…'
  if (p.estado === 'recording') return 'grabando audio…'
  return null
}

/** Texto sin los símbolos de formato (*, _, ~, ```), como en las vistas previas de WhatsApp. */
function sinFormato(texto) {
  return String(texto || '')
    .replace(/```([\s\S]+?)```/g, '$1')
    .replace(/(^|[\s(])([*_~])(?=\S)([^*_~\n]*?\S)\2(?=$|[\s.,!?:;)])/g, '$1$3')
}

function previaHtml(c) {
  const actividad = actividadDe(c.id)
  if (actividad) return `<span class="row-prev escribiendo">${actividad}</span>`
  const borrador = c.id !== state.activo && borradores.get(c.id)
  if (borrador) return `<span class="row-prev"><span class="borrador">Borrador:</span> ${esc(borrador)}</span>`
  const u = c.ultimo
  if (!u) return '<span class="row-prev"></span>'
  if (u.eliminado) return `<span class="row-prev deleted">${ic('history')}Se eliminó este mensaje</span>`
  const p = PREVIA[u.tipo]
  const texto = u.texto ? esc(sinFormato(u.texto)) : p ? p[1] : ''
  // En un grupo importa quién habló, igual que en WhatsApp: "Seba: buenas".
  const quien = c.esGrupo && !u.deMi && u.autorNombre ? `<b class="prev-autor">${esc(u.autorNombre)}:</b> ` : ''
  return `<span class="row-prev">${u.deMi ? tickHtml(u.estado) : ''}${quien}${p ? ic(p[0]) : ''}${texto}</span>`
}

/** Como WhatsApp: primero los fijados (el último fijado arriba), después por actividad. */
function ordenChats(a, b) {
  const fa = a.fijado || 0
  const fb = b.fijado || 0
  if (!fa !== !fb) return fa ? -1 : 1
  if (fa && fb && fa !== fb) return fb - fa
  return (b.ultimoTs || 0) - (a.ultimoTs || 0)
}

let listaPendiente = false
function pedirLista() {
  if (listaPendiente) return
  listaPendiente = true
  requestAnimationFrame(() => { listaPendiente = false; renderList() })
}

/**
 * Título y subtítulo de un chat. A un contacto que no está en la agenda se lo identifica
 * por su número, y debajo va el nombre que esa persona se puso en WhatsApp.
 */
function rotuloChat(c) {
  if (c.esGrupo) return { titulo: c.nombre, sub: '' }
  if (c.guardadoEnAgenda) {
    return { titulo: c.nombre, sub: c.telefono && c.nombre !== c.telefono ? c.telefono : '' }
  }
  const apodo = c.pushName || c.notify || ''
  return {
    titulo: c.telefono || c.nombre,
    sub: apodo && apodo !== c.telefono ? apodo : '',
    subEsNombre: true,
  }
}

function filaChat(c) {
  const r = rotuloChat(c)
  const sub = r.sub ? `<span class="row-sub ${r.subEsNombre ? '' : 'tnum'}">${esc(r.sub)}</span>` : ''
  const otros = otrosEnChat(c.id)
  const iconos = [
    otros.length ? `<span class="agente-tag" title="${esc(nombresLista(otros))} ${otros.length === 1 ? 'está' : 'están'} en este chat">${ic('user')}<span>${esc(nombresLista(otros))}</span></span>` : '',
    c.silenciado ? ic('mute') : '',
    c.fijado && !c.archivado ? ic('fijado') : '',
    c.noLeidos ? `<span class="unread tnum">${c.noLeidos}</span>` : '',
  ].join('')
  const clases = ['row', c.id === state.activo && 'active', c.noLeidos && 'has-unread', c.silenciado && 'silenciado'].filter(Boolean).join(' ')
  return `<button class="${clases}" data-chat="${esc(c.id)}">
    ${avatarHtml(c)}
    <span class="row-main">
      <span class="row-top"><span class="row-name ${r.subEsNombre ? 'tnum' : ''}">${esc(r.titulo)}</span></span>${sub}
      ${previaHtml(c)}
    </span>
    <span class="row-side"><span class="tnum">${horaLista(c.ultimoTs)}</span><span class="row-icons">${iconos}</span></span>
  </button>`
}

function renderList() {
  const todos = [...state.chats.values()]
  const archivados = todos.filter((c) => c.archivado)
  if (state.verArchivados && !archivados.length) state.verArchivados = false
  const q = state.q.trim().toLowerCase()

  // Al buscar se incluyen los archivados, igual que en WhatsApp Web.
  let base = q ? todos : state.verArchivados ? archivados : todos.filter((c) => !c.archivado)
  base = base.sort(ordenChats)

  if (state.verArchivados && !q) {
    $('#filters').innerHTML = `<div class="list-title"><button class="icon-btn" data-act="salir-archivados" aria-label="Volver a los chats">${ic('back')}</button>Archivados</div>`
  } else {
    $('#filters').innerHTML = FILTROS.map((f) =>
      `<button class="chip" data-filter="${f.id}" aria-pressed="${state.filter === f.id}">${f.label}<em class="tnum">${base.filter(f.test).length}</em></button>`,
    ).join('')
  }

  const filtro = state.verArchivados && !q ? FILTROS[0] : FILTROS.find((f) => f.id === state.filter)
  const filas = base.filter(filtro.test).filter((c) => !q || `${c.nombre} ${c.telefono || ''} ${c.ultimo?.texto || ''}`.toLowerCase().includes(q))

  const archivadosNoLeidos = archivados.filter((c) => c.noLeidos > 0).length
  const filaArchivados = !state.verArchivados && !q && archivados.length
    ? `<button class="archivados-row" data-act="ver-archivados">${ic('archive')}Archivados<span class="n tnum">${archivadosNoLeidos || ''}</span></button>`
    : ''

  let vacio = ''
  if (!filas.length) {
    if (q) vacio = 'Ningún chat coincide con la búsqueda.'
    else if (state.verArchivados) vacio = 'No hay chats archivados.'
    else if (state.filter === 'no-leidos') vacio = 'No hay chats sin leer.'
    else vacio = 'Todavía no hay chats. Cuando la línea reciba o envíe un mensaje, aparece acá.'
  }
  const res = resultadosHtml()
  // Con búsqueda activa, "sin chats" no es un vacío: los mensajes pueden coincidir igual.
  const cuerpo = filas.length ? filas.map(filaChat).join('') : q && res ? '' : `<div class="empty">${vacio}</div>`
  $('#chatList').innerHTML = filaArchivados + cuerpo + res

  const total = todos.filter((c) => !c.archivado && !c.silenciado).reduce((s, c) => s + (c.noLeidos || 0), 0)
  document.title = `${total ? `(${total}) ` : ''}WhatsApp Neifert`
}

/* ---------------- Conversación ---------------- */

async function abrirChat(id) {
  const chat = state.chats.get(id)
  if (state.activo !== id) avisarViendo(id)
  state.activo = id
  state.mensajes = new Map()
  state.revelados.clear()
  cerrarInfo()
  if (seleccion.activa) salirSeleccion()
  state.visibles = PAGINA
  state.pegadoAbajo = true
  state.nuevosAbajo = 0
  state.respondiendo = null
  state.sinLeerCantidad = chat?.noLeidos || 0
  state.sinLeerDesde = null
  cerrarMenu()
  detenerAudios()
  $('#viewInbox').classList.add('open')
  $('#convEmpty').hidden = true
  for (const s of ['#convHead', '#messages', '#composer']) $(s).hidden = false
  actualizarBajar()
  renderRespuesta()
  renderList()
  renderHead()
  renderComposer()
  $('#msgList').innerHTML = '<div class="sys">Cargando mensajes…</div>'
  api(`/api/chats/${enc(id)}/presencia`, { method: 'POST' })
    .then((p) => p && state.activo === id && onPresencia({ chatId: id, ...p }))
    .catch(() => {})
  try {
    const lista = await api(`/api/chats/${enc(id)}/mensajes`)
    if (state.activo !== id) return
    for (const m of lista) state.mensajes.set(m.id, m)
    prepararSinLeer()
    renderMensajes()
    marcarLeido(id)
  } catch (err) {
    $('#msgList').innerHTML = `<div class="sys">No se pudieron cargar los mensajes: ${esc(err.message)}</div>`
  }
}

/** Ubica el primer mensaje no leído y agranda la tanda dibujada para que entre. */
function prepararSinLeer() {
  if (!state.sinLeerCantidad) return
  const todos = ordenados()
  const recibidos = todos.filter((m) => !m.deMi)
  const primero = recibidos[Math.max(0, recibidos.length - state.sinLeerCantidad)]
  if (!primero) return
  state.sinLeerDesde = primero.id
  const indice = todos.indexOf(primero)
  state.visibles = Math.max(PAGINA, todos.length - indice + 10)
}

function marcarLeido(id) {
  if (!state.chats.get(id)?.noLeidos && !state.config.confirmarLectura) return
  api(`/api/chats/${enc(id)}/leido`, { method: 'POST' }).catch(() => {})
}
let leidoTimer
function marcarLeidoDiferido(id) {
  clearTimeout(leidoTimer)
  leidoTimer = setTimeout(() => marcarLeido(id), 800)
}

function tituloChat(c) {
  return rotuloChat(c).titulo
}

function subtituloChat(c) {
  const actividad = actividadDe(c.id)
  if (actividad) return `<span class="estado-escribiendo">${actividad}</span>`
  const p = state.presencias.get(c.id)
  if (p && ['available', 'composing', 'recording', 'paused'].includes(p.estado)) return '<span class="estado-en-linea">en línea</span>'
  if (p?.visto) return `<span class="tnum">últ. vez ${diaDe(p.visto).toLowerCase()} a las ${hora(p.visto)}</span>`
  if (c.esGrupo) return `<span class="tnum">${esc(c.grupoNombre ? 'Grupo' : 'Grupo · WhatsApp todavía no mandó el nombre')}</span>`
  const r = rotuloChat(c)
  const partes = []
  if (r.sub) partes.push(r.sub)
  if (c.id.endsWith('@lid')) partes.push('WhatsApp no compartió el número')
  return `<span class="${r.subEsNombre ? '' : 'tnum'}">${esc(partes.join(' · ') || 'toca para ver la información')}</span>`
}

function renderHead() {
  const c = state.chats.get(state.activo) || { id: state.activo, nombre: state.activo }
  $('#convHead').innerHTML = `
    <button class="icon-btn back-btn" data-act="volver" aria-label="Volver a la lista">${ic('back')}</button>
    <button class="who-btn" data-act="info-chat" aria-label="Ver información del chat">
      ${avatarHtml(c)}
      <div class="who"><b>${esc(tituloChat(c))}</b>${subtituloChat(c)}</div>
    </button>
    <button class="icon-btn" data-act="buscar-chat" aria-label="Buscar en este chat" title="Buscar en este chat">${ic('search')}</button>
    ${otrosEnChat(c.id).length ? `<span class="tag equipo" title="Tiene este chat abierto ahora">${ic('user')} ${esc(nombresLista(otrosEnChat(c.id)))} ${otrosEnChat(c.id).length === 1 ? 'está' : 'están'} acá</span>` : ''}
    ${c.silenciado ? `<span class="tag">${ic('mute')} Silenciado</span>` : ''}
    ${c.archivado ? `<span class="tag">${ic('archive')} Archivado</span>` : ''}`
}

const ordenados = () => [...state.mensajes.values()].sort((a, b) => a.ts - b.ts)
const esAudio = (m) => m.tipo === 'nota_voz' || m.tipo === 'audio'
const urlMedia = (m) => `/api/chats/${enc(state.activo)}/media/${enc(m.id)}?e=${m.media?.estado || ''}`
const diaHtml = (d) => `<div class="day" data-dia="${esc(d)}">${esc(d)}</div>`
const sinLeerHtml = (n) => `<div class="sin-leer">${n === 1 ? '1 mensaje no leído' : `${n} mensajes no leídos`}</div>`

/** Dibuja los últimos `state.visibles` mensajes. Con mantenerPosicion no mueve lo que se está leyendo. */
/**
 * Un grupo recién traído no tiene mensajes viejos: WhatsApp solo manda el historial al
 * vincular y no lo reenvía después. Conviene decirlo en vez de dejar el chat en blanco.
 */
function vacioHtml() {
  if (esGrupoActivo()) {
    return 'Todavía no hay mensajes guardados de este grupo. WhatsApp manda el historial solo al vincular la línea, así que los anteriores no están: los nuevos van a ir apareciendo acá.'
  }
  return 'Todavía no hay mensajes en este chat. Escribí el primero.'
}

function renderMensajes({ mantenerPosicion = false } = {}) {
  const box = $('#messages')
  const lista = $('#msgList')
  const todos = ordenados()
  const desde = Math.max(0, todos.length - state.visibles)
  const visibles = todos.slice(desde)
  const distanciaAlFinal = box.scrollHeight - box.scrollTop

  const partes = []
  if (desde > 0) partes.push('<div class="mas-antiguos">Subí para ver mensajes anteriores</div>')
  let dia = null
  let lado = null
  for (const m of visibles) {
    const d = diaDe(m.ts)
    if (d !== dia) {
      partes.push(diaHtml(d))
      dia = d
      lado = null
    }
    if (m.id === state.sinLeerDesde) {
      partes.push(sinLeerHtml(state.sinLeerCantidad))
      lado = null
    }
    const ladoActual = `${m.deMi ? 'out' : 'in'}:${firmanteDe(m)}`
    partes.push(msgHtml(m, ladoActual !== lado))
    lado = ladoActual
  }
  lista.innerHTML = partes.length ? partes.join('') : `<div class="sys" data-vacio>${vacioHtml()}</div>`
  visibles.filter(esAudio).forEach((m) => actualizarVoz(m.id))

  const separador = lista.querySelector('.sin-leer')
  if (mantenerPosicion) {
    box.scrollTop = box.scrollHeight - distanciaAlFinal
  } else if (separador && box.scrollHeight > box.clientHeight) {
    // Como WhatsApp: abre mostrando desde el primer mensaje no leído.
    box.scrollTop += separador.getBoundingClientRect().top - box.getBoundingClientRect().top - 40
    state.pegadoAbajo = box.scrollHeight - box.scrollTop - box.clientHeight < 80
    actualizarBajar()
  } else {
    irAbajo()
  }
}

function irAbajo() {
  const box = $('#messages')
  box.scrollTop = box.scrollHeight
  state.pegadoAbajo = true
  state.nuevosAbajo = 0
  actualizarBajar()
}

function actualizarBajar() {
  const btn = $('#bajar')
  btn.hidden = !state.activo || state.pegadoAbajo
  const cnt = btn.querySelector('.cnt')
  cnt.hidden = !state.nuevosAbajo
  cnt.textContent = state.nuevosAbajo
}

let cargandoAnteriores = false
$('#messages').addEventListener('scroll', () => {
  const box = $('#messages')
  cerrarMenu()
  state.pegadoAbajo = box.scrollHeight - box.scrollTop - box.clientHeight < 80
  if (state.pegadoAbajo) state.nuevosAbajo = 0
  actualizarBajar()
  if (box.scrollTop < 200 && state.visibles < state.mensajes.size && !cargandoAnteriores) {
    cargandoAnteriores = true
    requestAnimationFrame(() => {
      state.visibles += PAGINA
      renderMensajes({ mantenerPosicion: true })
      cargandoAnteriores = false
    })
  }
}, { passive: true })

// Si la conversación está pegada abajo, sigue abajo aunque cambie de alto (fotos que terminan de cargar, ventana más chica).
const seguirAbajo = new ResizeObserver(() => {
  if (state.activo && state.pegadoAbajo) $('#messages').scrollTop = $('#messages').scrollHeight
})
seguirAbajo.observe($('#msgList'))
seguirAbajo.observe($('#messages'))

function onMensaje({ chatId, mensaje }) {
  if (chatId !== state.activo) return
  const existia = state.mensajes.has(mensaje.id)
  state.mensajes.set(mensaje.id, mensaje)

  if (existia) {
    const el = document.getElementById(domId(mensaje.id))
    if (!el) return // está fuera de la tanda dibujada
    const video = el.querySelector('video')
    if (video && !video.paused) return // no cortar un video que se está mirando
    el.outerHTML = msgHtml(mensaje, el.classList.contains('cola'))
    if (esAudio(mensaje)) actualizarVoz(mensaje.id)
    if (state.respondiendo === mensaje.id) renderRespuesta()
    return
  }

  if (ordenados().at(-1)?.id !== mensaje.id) {
    // Llegó un mensaje más viejo (historial): se redibuja en orden sin mover la vista.
    state.visibles++
    renderMensajes({ mantenerPosicion: !state.pegadoAbajo })
    return
  }

  state.visibles++
  const lista = $('#msgList')
  lista.querySelector('[data-vacio]')?.remove()
  const d = diaDe(mensaje.ts)
  const dias = lista.querySelectorAll('.day')
  if (dias[dias.length - 1]?.dataset.dia !== d) lista.insertAdjacentHTML('beforeend', diaHtml(d))
  const ultimo = lista.lastElementChild
  const mismoLado = ultimo?.classList.contains('msg') && ultimo.classList.contains(mensaje.deMi ? 'out' : 'in')
  const mismoAutor = (ultimo?.dataset.autor || '') === firmanteDe(mensaje)
  const cola = !(mismoLado && mismoAutor)
  lista.insertAdjacentHTML('beforeend', msgHtml(mensaje, cola))
  if (esAudio(mensaje)) actualizarVoz(mensaje.id)

  if (mensaje.deMi) irAbajo()
  else if (!state.pegadoAbajo) {
    state.nuevosAbajo++
    actualizarBajar()
  }
  if (!mensaje.deMi && document.visibilityState === 'visible') marcarLeidoDiferido(chatId)
}

function iconoEstado(e) {
  switch (e) {
    case 'pendiente': return `<span title="Enviando">${ic('clock')}</span>`
    case 'enviado': return `<span title="Enviado">${ic('check')}</span>`
    case 'entregado': return `<span title="Entregado">${ic('checks')}</span>`
    case 'leido': return `<span class="read" title="Leído">${ic('checks')}</span>`
    case 'reproducido': return `<span class="read" title="Reproducido">${ic('checks')}</span>`
    case 'error': return `<span class="err" title="No se pudo enviar">${ic('alert')}</span>`
    default: return ''
  }
}

const NOMBRE_MEDIA = { imagen: 'Foto', sticker: 'Sticker', video: 'Video', gif: 'GIF', nota_voz: 'Nota de voz', audio: 'Audio', documento: 'Documento' }
const ICONO_MEDIA = { imagen: 'image', sticker: 'image', video: 'video', gif: 'video', nota_voz: 'mic', audio: 'mic', documento: 'file' }

/** Archivo que todavía no está en disco: se descarga solo cuando el usuario lo pide (nunca automáticamente). */
function mediaPendienteHtml(m) {
  const md = m.media
  const nombre = md.nombre || NOMBRE_MEDIA[m.tipo] || 'Archivo'
  if (md.estado === 'grande') {
    return `<div class="media-missing">${ic('alert')}<span class="mm-txt"><b>${esc(nombre)}</b><small>${fmtBytes(md.tamano)}: supera el límite de descarga (50 MB).</small></span></div>`
  }
  if (md.estado === 'descargando') {
    return `<div class="media-missing"><span class="spinner" aria-hidden="true"></span><span class="mm-txt"><b>${esc(nombre)}</b><small>Descargando…</small></span></div>`
  }
  const error = md.estado === 'error'
  const detalle = [esAudio(m) && md.segundos ? fmtDur(md.segundos) : null, md.tamano ? fmtBytes(md.tamano) : null].filter(Boolean).join(' · ')
  return `<div class="media-missing ${error ? 'is-error' : ''}">
    ${ic(error ? 'alert' : ICONO_MEDIA[m.tipo] || 'file')}
    <span class="mm-txt"><b>${esc(nombre)}</b>${detalle ? `<small class="tnum">${detalle}</small>` : ''}${error ? `<small class="mm-err">${esc(md.error || 'No se pudo descargar.')}</small>` : ''}</span>
    <button class="btn ghost mm-btn" data-descargar="${esc(m.id)}">${error ? 'Reintentar' : 'Descargar'}</button>
  </div>`
}

function mediaHtml(m) {
  const md = m.media
  if (!md) return ''
  if (md.estado !== 'ok') return mediaPendienteHtml(m)
  const url = urlMedia(m)
  switch (m.tipo) {
    case 'imagen': return `<button class="media-img" data-ver="${url}" aria-label="Ampliar foto"><img src="${url}" alt="Foto" loading="lazy"></button>`
    case 'sticker': return `<img class="sticker" src="${url}" alt="Sticker" loading="lazy">`
    case 'video': return `<video class="media-video" src="${url}" controls preload="metadata"></video>`
    case 'gif': return `<video class="media-video" src="${url}" autoplay loop muted playsinline></video>`
    case 'nota_voz':
    case 'audio': return vozHtml(m)
    case 'documento': {
      const ext = (md.nombre?.includes('.') ? md.nombre.split('.').pop() : md.mime.split('/')[1] || 'doc').slice(0, 4).toUpperCase()
      return `<a class="doc" href="${url}&descargar=1" target="_blank" rel="noopener"><span class="ext">${esc(ext)}</span><div><b>${esc(md.nombre || 'Documento')}</b><span>${md.tamano ? fmtBytes(md.tamano) : ''}</span></div></a>`
    }
    default: return ''
  }
}

const esGrupoActivo = () => !!state.chats.get(state.activo)?.esGrupo

function autorDe(m) {
  if (m.deMi) return 'Vos'
  return m.autorNombre || state.chats.get(state.activo)?.nombre || 'Contacto'
}

/** Color estable por autor, como WhatsApp: el mismo nombre siempre del mismo color. */
function colorAutor(nombre) {
  let h = 0
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) % 360
  return h
}

/** Bloque de mensaje citado. En la burbuja es un botón que lleva al original. */
function citaHtml(q, { boton = true } = {}) {
  const p = PREVIA[q.tipo]
  const texto = q.eliminado ? 'Mensaje eliminado' : q.texto ? esc(sinFormato(q.texto)) : `${p ? ic(p[0]) : ''} ${p ? p[1] : 'Mensaje'}`
  const etiqueta = boton ? 'button' : 'div'
  return `<${etiqueta} class="cita ${q.deMi ? '' : 'de-contacto'}" ${boton ? `data-cita="${esc(q.id)}" aria-label="Ir al mensaje citado"` : ''}><b>${esc(autorDe(q))}</b><span class="cita-txt">${texto}</span></${etiqueta}>`
}

function msgHtml(m, cola) {
  const md = m.media
  // Un mensaje eliminado arranca tapado: ni el texto ni el archivo se dibujan, igual que
  // en WhatsApp. El original sigue guardado y se destapa con un clic en el aviso.
  const revelado = !!m.eliminado && state.revelados.has(m.id)
  const tapado = !!m.eliminado && !revelado
  const visual = !tapado && md?.estado === 'ok' && ['imagen', 'video', 'gif'].includes(m.tipo)
  const sticker = !tapado && md?.estado === 'ok' && m.tipo === 'sticker'
  let texto = ''
  let cuerpo = ''

  if (m.citado) {
    const q = state.mensajes.get(m.citado)
    cuerpo += q ? citaHtml(q) : '<div class="cita de-contacto"><b>Mensaje citado</b><span class="cita-txt">No está guardado en el respaldo.</span></div>'
  }
  if (m.tipo === 'desconocido') {
    texto = '<div class="txt">Este mensaje llegó antes de conectar el sistema, así que no hay copia del contenido.</div>'
  } else {
    cuerpo += mediaHtml(m)
    if (m.tipo === 'ubicacion' && m.ubicacion) {
      cuerpo += `<a class="map-link" href="https://www.google.com/maps?q=${m.ubicacion.lat},${m.ubicacion.lng}" target="_blank" rel="noopener">${ic('pin')}Ver ubicación en el mapa</a>`
    }
    if (m.tipo === 'contacto') texto = `<div class="txt">${ic('user')} Contacto: ${esc(m.texto || '')}</div>`
    // Foto, video o audio "para ver una vez": no se guarda, queda solo el aviso.
    else if (m.tipo === 'una_vez') texto = `<div class="txt">${ic('clock')} <i>${esc(m.texto || 'Para ver una vez')}</i></div>`
    else if (m.texto) {
      const grande = !md && m.tipo === 'texto' && soloEmojis(m.texto)
      texto = `<div class="txt ${grande ? 'emoji-grande' : ''}">${m.tipo === 'otro' ? `<i>${esc(m.texto)}</i>` : formatear(m.texto)}</div>`
    }
  }

  // Un mensaje eliminado se muestra como en WhatsApp. El contenido sigue guardado, así
  // que se puede destapar con un clic para saber qué decía y quién lo borró.
  const eliminado = m.eliminado
    ? `<button class="del-note" data-revelar="${esc(m.id)}" aria-expanded="${!!revelado}">${ic('history')}<span class="del-txt">${
        m.eliminado.por === 'yo' ? 'Eliminaste este mensaje' : 'Se eliminó este mensaje'
      }</span><span class="del-cta">${revelado ? 'Ocultar' : 'Ver qué decía'}</span></button>`
    : ''
  if (tapado) {
    cuerpo = ''
    texto = ''
  }
  const ediciones = m.ediciones?.length
    ? `<details class="ediciones"><summary>${m.ediciones.length === 1 ? 'Ver versión anterior' : `Ver ${m.ediciones.length} versiones anteriores`}</summary><ul>${m.ediciones
        .map((e) => `<li>${esc(e.texto) || '<i>(vacío)</i>'} <span class="tnum">· cambiado a las ${hora(e.ts)}</span></li>`)
        .join('')}</ul></details>`
    : ''
  const reacciones = m.reacciones ? Object.values(m.reacciones).filter(Boolean) : []
  const reacts = reacciones.length ? `<div class="reacts" aria-label="Reacciones">${reacciones.map(esc).join('')}</div>` : ''
  const meta = `<div class="meta">${m.destacado ? `<span class="star" title="Destacado">${ic('fijado')}</span>` : ''}${m.ediciones?.length ? '<span class="edited">editado</span>' : ''}<span class="tnum">${hora(m.ts)}</span>${m.deMi ? iconoEstado(m.estado) : ''}</div>`
  const opciones = m.tipo === 'desconocido' ? '' : `<button class="opciones" data-opciones="${esc(m.id)}" aria-label="Opciones del mensaje" aria-haspopup="menu" aria-expanded="false">${ic('down')}</button>`
  // En un grupo, quién habló va arriba de la burbuja y solo cuando cambia de persona.
  const nombreAutor = !m.deMi && cola && esGrupoActivo() && m.autorNombre
    ? `<div class="autor" style="--autor:${colorAutor(m.autorNombre)}">${esc(m.autorNombre)}</div>`
    : m.deMi && cola && m.enviadoPor
      ? `<div class="firma">${esc(m.enviadoPor.id === sesion.usuario?.id ? 'Vos' : m.enviadoPor.nombre)}</div>`
      : ''

  // Distribución de la hora dentro de la burbuja, igual que WhatsApp.
  let distribucion
  if (sticker) distribucion = 'sticker-msg'
  else if (visual) distribucion = texto && !ediciones ? 'con-media con-texto' : texto ? 'con-media sin-texto' : 'solo-media'
  else distribucion = texto && !ediciones ? 'con-texto' : 'sin-texto'

  const clases = [
    'msg', m.deMi ? 'out' : 'in', distribucion,
    cola && 'cola',
    m.ediciones?.length && 'editado',
    tapado && 'deleted',
    seleccion.activa && seleccion.ids.has(m.id) && 'elegido',
    revelado && 'revelado',
    reacciones.length && 'has-reacts',
    m.tipo === 'desconocido' && 'desconocido',
  ].filter(Boolean).join(' ')
  return `<div class="${clases}" id="${domId(m.id)}" data-id="${esc(m.id)}" data-autor="${esc(firmanteDe(m))}">${opciones}${nombreAutor}${eliminado}${cuerpo}${texto}${ediciones}${meta}${reacts}</div>`
}

/** Lleva al mensaje citado: si todavía no está dibujado, agranda la tanda hasta incluirlo. */
function irAMensaje(id) {
  if (!state.mensajes.has(id)) return toast('Ese mensaje no está guardado en el respaldo.')
  let el = document.getElementById(domId(id))
  if (!el) {
    const todos = ordenados()
    state.visibles = todos.length - todos.findIndex((m) => m.id === id) + 5
    state.pegadoAbajo = false
    renderMensajes({ mantenerPosicion: true })
    el = document.getElementById(domId(id))
  }
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  el.classList.remove('resaltado')
  void el.offsetWidth
  el.classList.add('resaltado')
}

/* ---------------- Selección múltiple y reenvío ---------------- */

const seleccion = { activa: false, ids: new Set(), destinos: new Set() }

function entrarSeleccion(id) {
  seleccion.activa = true
  seleccion.ids.clear()
  if (id) seleccion.ids.add(id)
  cerrarMenu()
  renderMensajes({ mantenerPosicion: true })
  renderBarraSeleccion()
}

function salirSeleccion() {
  seleccion.activa = false
  seleccion.ids.clear()
  renderBarraSeleccion()
  renderMensajes({ mantenerPosicion: true })
}

function alternarSeleccion(id) {
  if (seleccion.ids.has(id)) seleccion.ids.delete(id)
  else seleccion.ids.add(id)
  if (!seleccion.ids.size) return salirSeleccion()
  document.getElementById(domId(id))?.classList.toggle('elegido', seleccion.ids.has(id))
  renderBarraSeleccion()
}

/** Barra superior con la cuenta y las acciones, como WhatsApp al seleccionar. */
function renderBarraSeleccion() {
  const barra = $('#selBar')
  if (!seleccion.activa) {
    barra.hidden = true
    $('#convPane').classList.remove('seleccionando')
    return
  }
  const n = seleccion.ids.size
  const propios = [...seleccion.ids].every((id) => state.mensajes.get(id)?.deMi)
  barra.hidden = false
  $('#convPane').classList.add('seleccionando')
  barra.innerHTML = `
    <button class="icon-btn" data-act="sel-salir" aria-label="Cancelar selección">${ic('x')}</button>
    <b>${n === 1 ? '1 mensaje' : `${fmtNum(n)} mensajes`}</b>
    <span class="sel-acciones">
      <button class="icon-btn" data-act="sel-reenviar" aria-label="Reenviar" title="Reenviar">${ic('reply')}</button>
      <button class="icon-btn" data-act="sel-destacar" aria-label="Destacar" title="Destacar">${ic('fijado')}</button>
      ${propios ? `<button class="icon-btn peligro" data-act="sel-eliminar" aria-label="Eliminar para todos" title="Eliminar para todos">${ic('x')}</button>` : ''}
    </span>`
}

/** Diálogo para elegir a qué chats reenviar. */
function abrirReenviar() {
  if (!seleccion.ids.size) return
  seleccion.destinos.clear()
  $('#fwdDlg').showModal()
  renderReenviar()
}

function renderReenviar(filtro = '') {
  const q = filtro.trim().toLowerCase()
  const chats = [...state.chats.values()]
    .filter((c) => c.id !== state.activo)
    .filter((c) => !q || `${c.nombre} ${c.telefono || ''}`.toLowerCase().includes(q))
    .sort(ordenChats)
    .slice(0, 80)
  const n = seleccion.destinos.size
  $('#fwdLista').innerHTML = chats.length
    ? chats
        .map((c) => {
          const r = rotuloChat(c)
          return `<li><button class="fwd-fila ${seleccion.destinos.has(c.id) ? 'on' : ''}" data-fwd="${esc(c.id)}">
            ${avatarHtml(c)}
            <span><b>${esc(r.titulo)}</b>${r.sub ? `<span class="tnum">${esc(r.sub)}</span>` : ''}</span>
            <span class="fwd-check">${seleccion.destinos.has(c.id) ? ic('check') : ''}</span>
          </button></li>`
        })
        .join('')
    : '<li class="empty">Ningún chat coincide.</li>'
  $('#fwdEnviar').disabled = !n
  $('#fwdEnviar').textContent = n ? `Reenviar a ${n}` : 'Reenviar'
}

async function confirmarReenvio() {
  const ids = [...seleccion.ids]
  const destinos = [...seleccion.destinos]
  if (!ids.length || !destinos.length) return
  $('#fwdDlg').close()
  try {
    const r = await api(`/api/chats/${enc(state.activo)}/reenviar`, { method: 'POST', json: { ids, destinos } })
    toast(
      r.fallados
        ? `Se reenviaron ${fmtNum(r.enviados)}, ${fmtNum(r.fallados)} no salieron.`
        : `Listo: ${fmtNum(r.enviados)} ${r.enviados === 1 ? 'mensaje reenviado' : 'mensajes reenviados'} a ${fmtNum(r.chats)} ${r.chats === 1 ? 'chat' : 'chats'}.`,
    )
    salirSeleccion()
  } catch (err) {
    toast(err.message)
  }
}

/** Destacar o eliminar todo lo seleccionado, de a uno. */
async function accionEnLote(accion) {
  const ids = [...seleccion.ids]
  if (accion === 'eliminar' && !confirm(`¿Eliminar ${ids.length === 1 ? 'este mensaje' : `estos ${ids.length} mensajes`} para todos? Acá queda guardado el original.`)) return
  let ok = 0
  for (const id of ids) {
    try {
      const ruta = accion === 'eliminar' ? 'eliminar' : 'destacar'
      const cuerpo = accion === 'eliminar' ? { id } : { id, destacar: true }
      const act = await api(`/api/chats/${enc(state.activo)}/${ruta}`, { method: 'POST', json: cuerpo })
      onMensaje({ chatId: state.activo, mensaje: act })
      ok++
    } catch {
      // Se sigue con el resto: el resumen final dice cuántos salieron.
    }
  }
  toast(ok === ids.length ? 'Listo.' : `Se pudo con ${fmtNum(ok)} de ${fmtNum(ids.length)}.`)
  salirSeleccion()
}

/* ---------------- Sesión (login del CRM) y equipo ---------------- */

// Identifica esta pestaña ante el servidor, para saber qué chat tiene abierto cada una.
const PESTANA = Math.random().toString(36).slice(2, 12)
const sesion = { usuario: null, login: false }

// El CRM muestra el panel dentro de su página. Ahí la sesión es la del usuario del CRM:
// no hay "Ir al CRM" ni "Cerrar sesión", y si la sesión vence se le pide al CRM una nueva.
const EMBEBIDO = window.parent !== window
const avisarAlCrm = (datos) => EMBEBIDO && window.parent.postMessage({ origen: 'nf-wa', ...datos }, '*')

// El CRM le pasa su tema (claro/oscuro) para que el panel no desentone.
window.addEventListener('message', (e) => {
  if (e.source !== window.parent || e.data?.tipo !== 'nf-wa:tema') return
  if (e.data.tema !== 'dark' && e.data.tema !== 'light') return
  document.documentElement.dataset.theme = e.data.tema
  syncTema()
})

/**
 * Entra al panel. El CRM abre esta página con su token en la URL (#t=...): se canjea
 * por la cookie del panel y se borra de la barra de direcciones. Sin token, se revisa
 * si ya había una sesión abierta.
 */
async function entrar() {
  const m = /[#&]t=([^&]+)/.exec(location.hash)
  let res
  if (m) {
    history.replaceState(null, '', location.pathname + location.search)
    res = await fetch('/api/sesion', {
      method: 'POST',
      headers: { ...CABECERA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: decodeURIComponent(m[1]) }),
    })
  } else {
    res = await fetch('/api/sesion')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    pantallaSinSesion(data, res.status)
    return false
  }
  sesion.usuario = data.usuario || null
  sesion.login = !!data.login
  renderYo()
  avisarAlCrm({ tipo: 'nf-wa:listo' })
  return true
}

/**
 * Tapa el panel y explica cómo entrar. Embebido en el CRM, si la sesión venció (401) se
 * le avisa al CRM, que vuelve a cargar el panel con el token de su usuario.
 */
function pantallaSinSesion(data = {}, status = 0) {
  const pane = $('#sinSesion')
  $('#sinSesionTxt').textContent = data.error || 'Entrá al WhatsApp desde el CRM.'
  const link = $('#sinSesionLink')
  link.hidden = !data.crmUrl || EMBEBIDO
  if (data.crmUrl) link.href = data.crmUrl
  pane.hidden = false
  avisarAlCrm({ tipo: 'nf-wa:sin-sesion', vencida: status === 401 })
}

async function salirDeSesion() {
  try {
    await fetch('/api/sesion/salir', { method: 'POST', headers: CABECERA })
  } finally {
    pantallaSinSesion({ error: 'Cerraste la sesión del WhatsApp.', crmUrl: null })
  }
}

/** Quién está usando este panel, arriba a la derecha. */
function renderYo() {
  const el = $('#yo')
  if (!sesion.usuario) {
    el.hidden = true
    return
  }
  const otros = state.agentes.filter((a) => a.id !== sesion.usuario.id)
  el.hidden = false
  el.innerHTML = `
    <span class="yo-nombre" title="${otros.length ? `También conectados: ${esc(otros.map((a) => a.nombre).join(', '))}` : 'Nadie más conectado'}">
      ${ic('user')}${esc(sesion.usuario.nombre)}${otros.length ? `<em class="tnum">+${otros.length}</em>` : ''}
    </span>
    ${EMBEBIDO ? '' : `<button class="icon-btn" data-act="salir-sesion" aria-label="Cerrar sesión" title="Cerrar sesión">${ic('unlink')}</button>`}`
}

/** Compañeros que tienen abierto ese chat ahora mismo (sin contarme a mí). */
function otrosEnChat(chatId) {
  if (!chatId) return []
  return state.agentes.filter((a) => a.id !== sesion.usuario?.id && a.chats.includes(chatId))
}

const nombresLista = (ps) => ps.map((p) => p.nombre.split(' ')[0]).join(', ')

/** Le avisa al servidor qué chat tengo abierto, para que los demás lo vean. */
function avisarViendo(chatId) {
  if (!sesion.login) return
  api('/api/viendo', { method: 'POST', json: { pestana: PESTANA, chatId: chatId || null } }).catch(() => {})
}

/** Quién firmó un mensaje: el autor en un grupo, o el empleado que lo mandó. */
const firmanteDe = (m) => (m.deMi ? m.enviadoPor?.nombre || '' : m.autorNombre || '')

/* ---------------- Búsqueda de mensajes ---------------- */

const busqueda = { q: '', enChat: null, resultados: [], total: 0, cargando: false, pedido: 0 }

/** Resalta lo buscado dentro de un texto ya escapado. */
function resaltar(texto, q) {
  const limpio = esc(sinFormato(texto))
  if (!q) return limpio
  const sinAcentos = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const base = sinAcentos(limpio)
  const aguja = sinAcentos(q)
  const i = base.indexOf(aguja)
  if (i < 0) return limpio
  // Se recorta alrededor de la coincidencia para que se vea en una línea.
  const desde = Math.max(0, i - 30)
  const recorte = (desde ? '…' : '') + limpio.slice(desde, i) + '<mark>' + limpio.slice(i, i + q.length) + '</mark>' + limpio.slice(i + q.length, i + q.length + 60)
  return recorte
}

/** Pide los mensajes que coinciden. Se descartan las respuestas viejas que llegan tarde. */
async function buscarEnMensajes() {
  const q = busqueda.q.trim()
  if (q.length < 2) {
    busqueda.resultados = []
    busqueda.total = 0
    return renderList()
  }
  const mio = ++busqueda.pedido
  busqueda.cargando = true
  renderList()
  try {
    const params = new URLSearchParams({ q })
    if (busqueda.enChat) params.set('chat', busqueda.enChat)
    const r = await api(`/api/buscar?${params}`)
    if (mio !== busqueda.pedido) return
    busqueda.resultados = r.resultados
    busqueda.total = r.total
  } catch {
    if (mio === busqueda.pedido) busqueda.resultados = []
  } finally {
    if (mio === busqueda.pedido) {
      busqueda.cargando = false
      renderList()
    }
  }
}

let buscarTimer
function alBuscar(valor) {
  state.q = valor
  busqueda.q = valor
  clearTimeout(buscarTimer)
  // Se espera a que deje de tipear: cada búsqueda recorre todos los chats.
  buscarTimer = setTimeout(buscarEnMensajes, 220)
  renderList()
}

/** Bloque de resultados que va debajo de los chats que coinciden por nombre. */
function resultadosHtml() {
  const q = busqueda.q.trim()
  if (q.length < 2) return ''
  if (busqueda.cargando && !busqueda.resultados.length) {
    return '<div class="res-titulo">Mensajes</div><div class="empty">Buscando…</div>'
  }
  if (!busqueda.resultados.length) return '<div class="res-titulo">Mensajes</div><div class="empty">Ningún mensaje coincide.</div>'

  const enChat = busqueda.enChat ? state.chats.get(busqueda.enChat)?.nombre : null
  const titulo = enChat ? `Mensajes en ${esc(enChat)}` : 'Mensajes'
  const filas = busqueda.resultados
    .map((m) => {
      const c = state.chats.get(m.chatId)
      const quien = m.deMi ? 'Vos' : m.autorNombre || (c ? rotuloChat(c).titulo : '')
      return `<button class="res-fila" data-res="${esc(m.chatId)}" data-res-msg="${esc(m.id)}">
        ${avatarHtml(c || { id: m.chatId, nombre: '?' })}
        <span class="res-main">
          <span class="res-top"><b>${esc(c ? rotuloChat(c).titulo : m.chatId)}</b><span class="tnum">${horaLista(m.ts)}</span></span>
          <span class="res-txt">${quien ? `<i>${esc(quien)}: </i>` : ''}${resaltar(m.texto, q)}</span>
        </span>
      </button>`
    })
    .join('')
  const mas = busqueda.total > busqueda.resultados.length
    ? `<div class="empty">Se muestran ${fmtNum(busqueda.resultados.length)} de ${fmtNum(busqueda.total)} coincidencias. Afiná la búsqueda para ver el resto.</div>`
    : ''
  return `<div class="res-titulo">${titulo} <span class="tnum">${fmtNum(busqueda.total)}</span></div>${filas}${mas}`
}

/** Limita la búsqueda al chat abierto (la lupa del encabezado). */
function buscarEnChat() {
  busqueda.enChat = state.activo
  const input = $('#search')
  if (input) {
    input.value = ''
    input.focus()
    input.placeholder = `Buscar en ${state.chats.get(state.activo)?.nombre || 'este chat'}`
  }
  alBuscar('')
}

function salirDeBusqueda() {
  busqueda.enChat = null
  busqueda.resultados = []
  busqueda.total = 0
  const input = $('#search')
  if (input) {
    input.value = ''
    input.placeholder = 'Buscar un chat o iniciar uno nuevo'
  }
  state.q = ''
  busqueda.q = ''
  renderList()
}

/** Abre el chat del resultado y salta al mensaje. */
async function irAResultado(chatId, msgId) {
  if (state.activo !== chatId) await abrirChat(chatId)
  irAMensaje(msgId)
}

/* ---------------- Ficha del chat ---------------- */

const fechaLarga = (ms) => new Date(ms).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })

const SECCIONES_MEDIA = [
  ['fotos', 'image', 'Fotos'],
  ['videos', 'video', 'Videos'],
  ['audios', 'mic', 'Audios'],
  ['documentos', 'file', 'Documentos'],
  ['enlaces', 'chat', 'Enlaces'],
]

/** El panel tiene dos vistas: la ficha y la galería de archivos, como WhatsApp Web. */
const info = { ficha: null, vista: 'ficha', tab: 'fotos' }

function alternarInfo() {
  if ($('#infoPane').hidden) cargarInfo()
  else cerrarInfo()
}

function cerrarInfo() {
  $('#infoPane').hidden = true
  info.vista = 'ficha'
}

/** `jid` permite abrir la ficha de alguien con quien todavía no hay chat (un integrante). */
async function cargarInfo(jid) {
  const pane = $('#infoPane')
  const id = jid || state.activo
  if (!id) return
  const yaAbierto = !pane.hidden
  pane.hidden = false
  info.vista = 'ficha'
  if (!yaAbierto || jid) pane.innerHTML = `${cabeceraFija('Información')}<div class="sys">Cargando…</div>`
  try {
    const f = await api(`/api/chats/${enc(id)}/info`)
    if (pane.hidden) return
    info.ficha = f
    renderInfo()
  } catch (err) {
    pane.innerHTML = `${cabeceraFija('Información')}<div class="sys">${esc(err.message)}</div>`
  }
}

const cabeceraInfo = (titulo, atras = false) =>
  `<div class="info-head"><button class="icon-btn" data-act="${atras ? 'info-volver' : 'cerrar-info'}" aria-label="${atras ? 'Volver' : 'Cerrar'}">${ic(atras ? 'back' : 'x')}</button><b>${esc(titulo)}</b></div>`

/** La cabecera sola, pegada arriba (en la galería va junto con las pestañas). */
const cabeceraFija = (titulo, atras = false) => `<div class="info-fijo">${cabeceraInfo(titulo, atras)}</div>`

function renderInfo() {
  const f = info.ficha
  if (!f) return
  $('#infoPane').innerHTML = info.vista === 'media' ? vistaArchivos(f) : vistaFicha(f)
  $('#infoPane').scrollTop = 0
}

function vistaFicha(f) {
  const g = f.grupo
  const r = rotuloChat(f)
  const totalArchivos = SECCIONES_MEDIA.reduce((n, [k]) => n + (f.totales[k] || 0), 0)
  const ps = g?.participantes || []
  const partes = [cabeceraFija(f.esGrupo ? 'Info. del grupo' : 'Info. del contacto')]

  partes.push(`<div class="info-top">
    ${avatarHtml(f)}
    <h3>${esc(r.titulo)}</h3>
    ${r.sub ? `<p class="info-sub ${r.subEsNombre ? '' : 'tnum'}">${esc(r.sub)}</p>` : ''}
    ${f.esGrupo ? `<p class="info-meta">Grupo${ps.length ? ` · <b>${fmtNum(ps.length)} integrantes</b>` : ''}</p>` : ''}
    ${f.esGrupo && g?.creacion ? `<p class="info-sub">Creado el ${fechaLarga(g.creacion * 1000)}</p>` : ''}
    ${f.sinChat ? '<p class="info-sub">Todavía no hay conversación con este contacto.</p>' : ''}
  </div>`)

  if (g?.descripcion) {
    partes.push(`<div class="info-bloque"><h4>Descripción</h4><p class="info-desc">${formatear(g.descripcion)}</p></div>`)
  }

  // Fila que lleva a la galería, con el total a la derecha (igual que WhatsApp).
  partes.push(`<div class="info-bloque info-filas">
    <button class="info-fila" data-act="info-archivos"${totalArchivos ? '' : ' disabled'}>
      ${ic('image')}<span>Archivos, enlaces y documentos</span>
      <b class="tnum">${fmtNum(totalArchivos)}</b>${totalArchivos ? `<i class="chev">${ic('down')}</i>` : ''}
    </button>
    ${miniaturasHtml(f)}
  </div>`)

  partes.push(`<div class="info-bloque info-filas">
    <button class="info-fila" data-chat-act="archivar">${ic('archive')}<span>${f.archivado ? 'Desarchivar' : 'Archivar'}</span></button>
    <button class="info-fila" data-chat-act="fijar">${ic('pin')}<span>${f.fijado ? 'Dejar de fijar' : 'Fijar arriba'}</span></button>
    ${
      f.silenciado
        ? `<button class="info-fila" data-chat-act="activar-sonido">${ic('mute')}<span>Reactivar avisos</span></button>`
        : `<button class="info-fila" data-chat-act="silenciar" data-valor="siempre">${ic('mute')}<span>Silenciar notificaciones</span></button>`
    }
  </div>`)

  if (f.esGrupo) {
    partes.push(`<div class="info-bloque">
      <h4>${ps.length ? `${fmtNum(ps.length)} integrantes` : 'Integrantes'}</h4>
      ${
        ps.length
          ? `<ul class="info-gente">${ps.map(filaIntegrante).join('')}</ul>`
          : `<p class="info-vacio">${esc(g?.error ? `No se pudieron traer los integrantes: ${g.error}` : 'Sin datos de integrantes.')}</p>`
      }
    </div>`)
    partes.push(`<div class="info-bloque info-filas">
      <button class="info-fila peligro" data-act="salir-grupo">${ic('unlink')}<span>Salir del grupo</span></button>
    </div>`)
  }

  partes.push(`<p class="path info-pie">${fmtNum(f.mensajes)} mensajes guardados en el respaldo.</p>`)
  return partes.join('')
}

/** Una persona del grupo. Tocarla abre su ficha, como en WhatsApp. */
function filaIntegrante(p) {
  const esVos = p.nombre === 'Vos'
  return `<li><button class="gente-btn" ${esVos ? 'disabled' : `data-persona="${esc(p.id)}"`}>
    ${avatarHtml({ id: p.id, nombre: p.nombre, foto: p.foto })}
    <div><b>${esc(p.nombre)}</b>${p.telefono ? `<span class="tnum">${esc(p.telefono)}</span>` : ''}</div>
    ${p.admin ? `<span class="tag verde">${p.admin === 'creador' ? 'Creador' : 'Admin. del grupo'}</span>` : ''}
  </button></li>`
}

/** Las últimas miniaturas, como adelanto de la galería. */
function miniaturasHtml(f) {
  const visuales = [...f.media.fotos, ...f.media.videos]
    .filter((m) => m.descargado)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 6)
  if (!visuales.length) return ''
  return `<div class="info-galeria chica">${visuales.map((m) => celdaMedia(f, m)).join('')}</div>`
}

function celdaMedia(f, m) {
  const url = `/api/chats/${enc(f.id)}/media/${enc(m.id)}`
  if (m.tipo === 'imagen') return `<button data-ver="${url}" aria-label="Ampliar foto"><img src="${url}" alt="" loading="lazy"></button>`
  return `<a href="${url}" target="_blank" rel="noopener" aria-label="Ver video"><video src="${url}" muted preload="metadata"></video><span class="play">${ic('play')}</span></a>`
}

/** Baja un archivo desde la ficha y refresca la lista cuando termina. */
async function bajarUno(id, boton) {
  const f = info.ficha
  if (!f) return
  boton.disabled = true
  boton.innerHTML = '<span class="spinner" aria-hidden="true"></span>Bajando…'
  try {
    await api(`/api/chats/${enc(f.id)}/media/${enc(id)}/descargar`, { method: 'POST' })
    await cargarInfo(f.sinChat ? f.id : undefined)
  } catch (err) {
    toast(err.message)
    boton.disabled = false
    boton.innerHTML = `${ic('download')}Descargar`
  }
}

/** Encabezado de una burbuja de archivo: quién lo mandó y su número, como WhatsApp Web. */
function autorArchivoHtml(f, m) {
  const quien = m.deMi ? 'Vos' : m.autorNombre || (f.esGrupo ? null : f.nombre)
  if (!quien) return ''
  const tel = !m.deMi && m.autorTelefono && m.autorTelefono !== quien ? `<span class="tnum">${esc(m.autorTelefono)}</span>` : ''
  return `<div class="arch-cab"><span class="arch-autor" style="--autor:${colorAutor(quien)}">${esc(quien)}</span>${tel}</div>`
}

const NOMBRE_ARCHIVO = { imagen: 'Foto', video: 'Video', gif: 'GIF', nota_voz: 'Nota de voz', audio: 'Audio', documento: 'Documento' }

/** Lo que se muestra a la derecha: descargar, bajar ahora, o el motivo de que no esté. */
function accionArchivoHtml(f, m) {
  if (m.descargado) {
    return `<a class="icon-btn" href="/api/chats/${enc(f.id)}/media/${enc(m.id)}?descargar=1" aria-label="Descargar" title="Descargar">${ic('download')}</a>`
  }
  if (m.perdido) return `<span class="tag" title="WhatsApp ya no tiene este archivo">No disponible</span>`
  return `<button class="btn ghost chico" data-bajar="${esc(m.id)}">${ic('download')}Descargar</button>`
}

/**
 * Un archivo como se ve en el chat: quién lo mandó arriba, la tarjeta o la miniatura, el
 * epígrafe y la hora. Sirve igual para fotos, videos, audios y documentos.
 */
function burbujaArchivo(f, m) {
  const visual = (m.tipo === 'imagen' || m.tipo === 'video' || m.tipo === 'gif') && m.descargado
  const url = `/api/chats/${enc(f.id)}/media/${enc(m.id)}`
  const titulo = m.nombre || NOMBRE_ARCHIVO[m.tipo] || 'Archivo'
  const ext = (m.nombre?.split('.').pop() || '').toUpperCase().slice(0, 4)
  const detalle = [ext && ext !== titulo.toUpperCase() ? ext : null, m.tamano ? fmtBytes(m.tamano) : null, m.segundos ? fmtDur(m.segundos) : null]
    .filter(Boolean)
    .join(' · ')

  let cuerpo
  if (visual) {
    // Ya descargado: se ve la foto, y se amplía o se abre con un clic.
    cuerpo =
      m.tipo === 'imagen'
        ? `<button class="arch-img" data-ver="${url}" aria-label="Ampliar foto"><img src="${url}" alt="" loading="lazy"></button>`
        : `<a class="arch-img" href="${url}" target="_blank" rel="noopener" aria-label="Ver video"><video src="${url}" muted preload="metadata"></video><span class="play">${ic('play')}</span></a>`
  } else {
    cuerpo = `<div class="arch-fila">
      <span class="arch-ico ${m.tipo}">${ic(ICONO_MEDIA[m.tipo] || 'file')}</span>
      <span class="arch-datos"><b>${esc(titulo)}</b>${detalle ? `<span class="tnum">${esc(detalle)}</span>` : ''}</span>
      ${accionArchivoHtml(f, m)}
    </div>`
  }

  return `<li class="arch-item">
    ${autorArchivoHtml(f, m)}
    <div class="arch-burbuja ${m.deMi ? 'out' : 'in'}">
      ${cuerpo}
      ${visual ? `<div class="arch-sobre">${accionArchivoHtml(f, m)}</div>` : ''}
      ${m.texto ? `<div class="arch-txt">${formatear(m.texto)}</div>` : ''}
      <div class="arch-pie tnum">${diaDe(m.ts)} · ${hora(m.ts)}</div>
    </div>
  </li>`
}

/** Un enlace, con la misma forma de burbuja que los archivos. */
function burbujaEnlace(f, l) {
  const href = l.url.startsWith('www.') ? `https://${l.url}` : l.url
  let dominio = l.url
  try {
    dominio = new URL(href).hostname.replace(/^www\./, '')
  } catch {
    // URL rara: se muestra tal cual vino.
  }
  return `<li class="arch-item">
    ${autorArchivoHtml(f, l)}
    <div class="arch-burbuja ${l.deMi ? 'out' : 'in'}">
      <a class="arch-fila enlace" href="${esc(href)}" target="_blank" rel="noopener noreferrer">
        <span class="arch-ico enlace">${ic('chat')}</span>
        <span class="arch-datos"><b>${esc(l.url)}</b><span class="tnum">${esc(dominio)}</span></span>
      </a>
      ${l.texto && sinFormato(l.texto).trim() !== l.url ? `<div class="arch-txt">${formatear(l.texto)}</div>` : ''}
      <div class="arch-pie tnum">${diaDe(l.ts)} · ${hora(l.ts)}</div>
    </div>
  </li>`
}

/** Galería completa, con una pestaña por tipo de archivo. */
function vistaArchivos(f) {
  const disponibles = SECCIONES_MEDIA.filter(([k]) => f.totales[k])
  if (!disponibles.some(([k]) => k === info.tab)) info.tab = disponibles[0]?.[0] || 'fotos'
  const tabs = disponibles
    .map(([k, , titulo]) => `<button class="info-tab ${k === info.tab ? 'on' : ''}" data-info-tab="${k}">${titulo} <span class="tnum">${fmtNum(f.totales[k])}</span></button>`)
    .join('')

  // Todo se ve igual que en el chat: la foto sin descargar también aparece, con su botón.
  const cuerpo =
    info.tab === 'enlaces'
      ? `<ul class="info-archivos">${f.enlaces.map((l) => burbujaEnlace(f, l)).join('')}</ul>`
      : `<ul class="info-archivos">${f.media[info.tab].map((m) => burbujaArchivo(f, m)).join('')}</ul>`

  const pendientes = ['fotos', 'videos', 'audios', 'documentos'].reduce(
    (n, k) => n + f.media[k].filter((m) => !m.descargado).length,
    0,
  )
  // Los que ya se dieron por perdidos se ofrecen aparte: insistir solo, sin que el
  // usuario lo pida, gasta conexión con WhatsApp sin conseguir nada.
  const perdidos = ['fotos', 'videos', 'audios', 'documentos'].reduce(
    (n, k) => n + f.media[k].filter((m) => m.perdido).length,
    0,
  )
  const bajarTodo = !pendientes
    ? ''
    : pendientes > perdidos
      ? `<button class="btn ghost bajar-todo" data-act="bajar-todo">${ic('download')}Descargar los ${fmtNum(pendientes - perdidos)} que faltan</button>`
      : `<button class="btn ghost bajar-todo" data-act="bajar-todo" data-reintentar="1">${ic('refresh')}Reintentar los ${fmtNum(perdidos)} que fallaron</button>`
  return `<div class="info-fijo">
      ${cabeceraInfo('Archivos, enlaces y documentos', true)}
      <div class="info-tabs">${tabs}</div>
    </div>
    <div class="info-bloque">${bajarTodo}${cuerpo}</div>`
}

/* ---------------- Emojis ---------------- */

// Los de uso diario, agrupados como en WhatsApp. Alcanza para escribir: no hace falta
// cargar una librería entera ni pedirle nada a un CDN.
const EMOJIS = {
  'Caritas': '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤗 🤭 🤔 🤐 😐 😑 😶 😏 😒 🙄 😬 😮 😯 😪 😴 😌 😔 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 😱 😨 😰 😥 😓 🤗 🫡 🥳 😎 🤓 🧐',
  'Gestos': '👍 👎 👌 🤌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 🙏 💪 🙌 👏 🫶 ✍️ 💅 👀',
  'Corazones': '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 ✨ 🔥 💯 ⭐ 🎉 🎊 🥂 🎁',
  'Autos': '🚗 🚙 🛻 🚐 🚚 🚛 🏎️ 🏍️ 🛵 🚜 🚨 ⛽ 🔧 🔩 🛞 🔑 🗝️ 📍 🛣️ 🅿️ 🚦 💰 💵 💸 💳 🧾 📄 📆 ✅ ❌ ⚠️ ℹ️ 📞 📲 💬 ⏰ 👉 🔝',
}

function abrirEmojis(boton) {
  const panel = $('#emojiPanel')
  if (!panel.hidden) return cerrarEmojis()
  panel.innerHTML = Object.entries(EMOJIS)
    .map(([titulo, lista]) => `<div class="emo-grupo"><h4>${titulo}</h4><div class="emo-grid">${lista
      .split(' ')
      .map((e) => `<button type="button" data-emoji="${e}" aria-label="${e}">${e}</button>`)
      .join('')}</div></div>`)
    .join('')
  panel.hidden = false
  const r = boton.getBoundingClientRect()
  panel.style.left = `${Math.max(8, Math.min(r.left, innerWidth - panel.offsetWidth - 8))}px`
  panel.style.top = `${Math.max(8, r.top - panel.offsetHeight - 8)}px`
  boton.setAttribute('aria-expanded', 'true')
}

function cerrarEmojis() {
  const panel = $('#emojiPanel')
  if (panel.hidden) return
  panel.hidden = true
  $('#emojiBtn')?.setAttribute('aria-expanded', 'false')
}

/** Mete el emoji donde está el cursor, sin perder lo que ya estaba escrito. */
function ponerEmoji(emoji) {
  const ta = $('#msgInput')
  if (!ta) return
  const ini = ta.selectionStart ?? ta.value.length
  const fin = ta.selectionEnd ?? ta.value.length
  ta.value = ta.value.slice(0, ini) + emoji + ta.value.slice(fin)
  const pos = ini + emoji.length
  ta.setSelectionRange(pos, pos)
  ta.focus()
  autoAlto(ta)
  guardarBorrador(state.activo, ta.value)
  syncSendBtn()
}

/* ---------------- Menú del mensaje ---------------- */

/**
 * Deja el menú flotante dentro de la pantalla. `ancla` es un DOMRect: el del botón que
 * lo abrió, o un punto del cursor con click derecho.
 */
function ubicarMenu(menu, ancla, alinearDerecha = false) {
  const ancho = menu.offsetWidth
  const alto = menu.offsetHeight
  const izquierda = Math.max(8, Math.min(alinearDerecha ? ancla.right - ancho : ancla.left, innerWidth - ancho - 8))
  let arriba = ancla.bottom + 4
  if (arriba + alto > innerHeight - 8) arriba = ancla.top - alto - 4
  menu.style.left = `${izquierda}px`
  menu.style.top = `${Math.max(8, arriba)}px`
}

/** Un click derecho se comporta como un botón de cero por cero en la punta del cursor. */
const puntoDe = (e) => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY })

function abrirMenu(id, ancla, boton = null) {
  const m = state.mensajes.get(id)
  if (!m) return
  cerrarMenu()
  const menu = $('#menuMsg')
  const mia = m.reacciones?.yo
  const puedeEliminar = m.deMi && !m.eliminado
  menu.innerHTML = `
    <div class="reac-bar">${REACCIONES.map((e) => `<button data-reaccionar="${e}" aria-pressed="${mia === e}" aria-label="Reaccionar con ${e}">${e}</button>`).join('')}</div>
    <button class="item" role="menuitem" data-act="responder">${ic('reply')}Responder</button>
    <button class="item" role="menuitem" data-act="reenviar">${ic('send')}Reenviar</button>
    <button class="item" role="menuitem" data-act="seleccionar">${ic('check')}Seleccionar mensajes</button>
    ${m.texto ? `<button class="item" role="menuitem" data-act="copiar">${ic('copy')}Copiar texto</button>` : ''}
    ${m.media?.estado === 'ok' ? `<a class="item" role="menuitem" style="color:inherit;text-decoration:none" href="${urlMedia(m)}&descargar=1" target="_blank" rel="noopener">${ic('download')}Descargar</a>` : ''}
    ${m.citado ? `<button class="item" role="menuitem" data-act="ir-citado">${ic('reply')}Ir al mensaje citado</button>` : ''}
    <button class="item" role="menuitem" data-act="destacar">${ic('fijado')}${m.destacado ? 'Quitar destacado' : 'Destacar'}</button>
    ${m.eliminado ? `<button class="item" role="menuitem" data-act="ver-eliminado">${ic('history')}${state.revelados.has(m.id) ? 'Ocultar el original' : 'Ver qué decía'}</button>` : ''}
    <button class="item" role="menuitem" data-act="info-msg">${ic('circle-check')}Información</button>
    ${puedeEliminar ? `<button class="item peligro" role="menuitem" data-act="eliminar-msg">${ic('x')}Eliminar para todos</button>` : ''}`
  menu.dataset.msg = id
  menu.hidden = false
  ubicarMenu(menu, ancla, m.deMi && !!boton)
  boton?.setAttribute('aria-expanded', 'true')
  state.menuBoton = boton
}

/** Menú del chat: las mismas acciones que el menú largo de WhatsApp, y viajan al celular. */
function abrirMenuChat(id, ancla) {
  const c = state.chats.get(id)
  if (!c) return
  cerrarMenu()
  const menu = $('#menuChat')
  const sil = c.silenciado
  menu.innerHTML = `
    <div class="menu-titulo">${esc(c.nombre)}</div>
    <button class="item" role="menuitem" data-chat-act="archivar">${ic('archive')}${c.archivado ? 'Desarchivar' : 'Archivar'}</button>
    <button class="item" role="menuitem" data-chat-act="fijar">${ic('pin')}${c.fijado ? 'Dejar de fijar' : 'Fijar arriba'}</button>
    ${sil
      ? `<button class="item" role="menuitem" data-chat-act="activar-sonido">${ic('mute')}Reactivar avisos</button>`
      : `<button class="item" role="menuitem" data-chat-act="silenciar" data-valor="8h">${ic('mute')}Silenciar 8 horas</button>
         <button class="item" role="menuitem" data-chat-act="silenciar" data-valor="1s">${ic('mute')}Silenciar 1 semana</button>
         <button class="item" role="menuitem" data-chat-act="silenciar" data-valor="siempre">${ic('mute')}Silenciar siempre</button>`}
    ${c.noLeidos ? '' : `<button class="item" role="menuitem" data-chat-act="no-leido">${ic('chat')}Marcar como no leído</button>`}`
  menu.dataset.chat = id
  menu.hidden = false
  ubicarMenu(menu, ancla)
}

function cerrarMenu() {
  for (const sel of ['#menuMsg', '#menuChat']) {
    const menu = $(sel)
    if (menu && !menu.hidden) menu.hidden = true
  }
  state.menuBoton?.setAttribute('aria-expanded', 'false')
  state.menuBoton = null
}

const AVISO_MARCA = {
  archivar: (c) => (c.archivado ? 'Chat archivado, también en el celular.' : 'Chat desarchivado.'),
  fijar: (c) => (c.fijado ? 'Chat fijado arriba.' : 'El chat ya no está fijado.'),
  silenciar: () => 'Chat silenciado, también en el celular.',
  'activar-sonido': () => 'Avisos reactivados.',
  'no-leido': () => 'Marcado como no leído.',
}

/** Archiva, fija o silencia. El servidor lo manda al celular y devuelve el chat ya actualizado. */
async function accionChat(id, accion, valor) {
  cerrarMenu()
  if (!id) return
  const c = state.chats.get(id)
  if (!c) return
  const cuerpo = { accion, valor: valor ?? null }
  if (accion === 'archivar') cuerpo.valor = !c.archivado
  else if (accion === 'fijar') cuerpo.valor = !c.fijado
  else if (accion === 'activar-sonido') {
    cuerpo.accion = 'silenciar'
    cuerpo.valor = null
  }
  try {
    const actualizado = await api(`/api/chats/${enc(id)}/marca`, { method: 'POST', json: cuerpo })
    state.chats.set(id, actualizado)
    pedirLista()
    if (id === state.activo) {
      renderHead()
      if (!$('#infoPane').hidden) cargarInfo()
    }
    toast(AVISO_MARCA[accion]?.(actualizado) || 'Listo, también se aplicó en el celular.')
  } catch (err) {
    toast(err.message)
  }
}


/** Ficha del mensaje: hora, estado, autor y de dónde salió. */
function infoMensaje(m) {
  const partes = [
    `Enviado ${diaDe(m.ts).toLowerCase()} a las ${hora(m.ts)}`,
    m.deMi ? `Estado: ${ESTADO_TEXTO[m.estado] || 'sin confirmar'}` : `De: ${autorDe(m)}`,
    m.destacado ? 'Destacado' : null,
    m.eliminado ? `Eliminado a las ${hora(m.eliminado.ts)} por ${m.eliminado.por === 'yo' ? 'la línea' : 'el contacto'}` : null,
    m.ediciones?.length ? `Editado ${m.ediciones.length} ${m.ediciones.length === 1 ? 'vez' : 'veces'}` : null,
    m.media?.tamano ? `Archivo: ${fmtBytes(m.media.tamano)}` : null,
    m.enviadoPor ? `Enviado por ${m.enviadoPor.nombre}` : null,
    m.origen === 'historial' ? 'Llegó con el historial al vincular' : null,
  ].filter(Boolean)
  toast(partes.join(' · '), 7000)
}

const ESTADO_TEXTO = {
  pendiente: 'enviando', enviado: 'enviado', entregado: 'entregado', leido: 'leído', reproducido: 'reproducido', error: 'no se pudo enviar',
}

async function reaccionar(id, emoji) {
  const m = state.mensajes.get(id)
  if (!m) return
  const nuevo = m.reacciones?.yo === emoji ? '' : emoji
  try {
    const actualizado = await api(`/api/chats/${enc(state.activo)}/reaccion`, { method: 'POST', json: { id, emoji: nuevo } })
    onMensaje({ chatId: state.activo, mensaje: actualizado })
  } catch (err) {
    toast(err.message)
  }
}

function renderRespuesta() {
  const box = $('#respuesta')
  const m = state.respondiendo && state.mensajes.get(state.respondiendo)
  $('#convPane').classList.toggle('con-respuesta', !!m)
  if (!m) {
    box.hidden = true
    box.innerHTML = ''
    return
  }
  box.innerHTML = `${citaHtml(m, { boton: false })}<button class="icon-btn" data-act="cancelar-respuesta" aria-label="Cancelar respuesta">${ic('x')}</button>`
  box.hidden = false
}

/* ---------------- Notas de voz ---------------- */

const audios = new Map()

function onda(id) {
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return Array.from({ length: 34 }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0
    return 22 + ((h >>> 8) % 70) * (0.6 + 0.4 * Math.sin(i / 3))
  })
}

const etiquetaVelocidad = (v) => `${String(v).replace('.', ',')}×`

function vozHtml(m) {
  const barras = onda(m.id).map((h) => `<i style="height:${Math.min(100, h).toFixed(0)}%"></i>`).join('')
  return `<div class="voice" id="v-${domId(m.id)}">
    <button class="play" data-play="${esc(m.id)}" aria-label="Reproducir">${ic('play')}</button>
    <div class="wave" data-seek="${esc(m.id)}">${barras}</div>
    <button class="velocidad tnum" data-velocidad="${esc(m.id)}" aria-label="Velocidad de reproducción">${etiquetaVelocidad(state.velocidades.get(m.id) || 1)}</button>
    <div class="voice-meta tnum"><span class="cur">0:00</span><span class="tot">${fmtDur(m.media?.segundos)}</span></div>
  </div>`
}

function audioDe(id) {
  let a = audios.get(id)
  if (a) return a
  a = new Audio(urlMedia(state.mensajes.get(id)))
  a.preload = 'metadata'
  a.playbackRate = state.velocidades.get(id) || 1
  for (const ev of ['timeupdate', 'play', 'pause', 'loadedmetadata']) a.addEventListener(ev, () => actualizarVoz(id))
  a.addEventListener('ended', () => { a.currentTime = 0; actualizarVoz(id) })
  a.addEventListener('error', () => toast('No se pudo reproducir el audio.'))
  audios.set(id, a)
  return a
}

function actualizarVoz(id) {
  const el = document.getElementById(`v-${domId(id)}`)
  if (!el) return
  const a = audios.get(id)
  const total = (a && Number.isFinite(a.duration) && a.duration) || state.mensajes.get(id)?.media?.segundos || 0
  const actual = a?.currentTime || 0
  const barras = el.querySelectorAll('.wave i')
  const encendidas = total ? Math.round((actual / total) * barras.length) : 0
  barras.forEach((b, i) => b.classList.toggle('on', i < encendidas))
  el.querySelector('.cur').textContent = fmtDur(actual)
  el.querySelector('.tot').textContent = fmtDur(total)
  const sonando = a && !a.paused
  const btn = el.querySelector('.play')
  btn.innerHTML = ic(sonando ? 'pause' : 'play')
  btn.setAttribute('aria-label', sonando ? 'Pausar' : 'Reproducir')
}

function detenerAudios() {
  for (const a of audios.values()) a.pause()
  audios.clear()
}

/* ---------------- Envío ---------------- */

let borradorTimer
function guardarBorrador(chatId, texto) {
  if (!chatId) return
  if (texto.trim()) borradores.set(chatId, texto)
  else borradores.delete(chatId)
  clearTimeout(borradorTimer)
  borradorTimer = setTimeout(() => guardarLocal('wa-borradores', Object.fromEntries(borradores)), 400)
}

function autoAlto(ta) {
  ta.style.height = 'auto'
  ta.style.height = `${Math.min(ta.scrollHeight, 136)}px`
}

function renderComposer() {
  const el = $('#composer')
  const off = !conectado()
  state.composerOff = off
  if (state.grabacion) {
    el.innerHTML = `<div class="recording"><span class="pulse"></span><span class="tnum" id="recT">0:00</span> Grabando nota de voz<button class="cancel" data-act="rec-cancelar">Cancelar</button></div>
      <button class="send" data-act="rec-enviar" aria-label="Enviar nota de voz">${ic('send')}</button>`
    return
  }
  el.innerHTML = `
    <button class="icon-btn" id="emojiBtn" data-act="emojis" aria-label="Emojis" title="Emojis" aria-haspopup="dialog" aria-expanded="false" ${off ? 'disabled' : ''}>${ic('smile')}</button>
    <button class="icon-btn" data-act="adjuntar" aria-label="Adjuntar foto, video o documento" title="Adjuntar" ${off ? 'disabled' : ''}>${ic('clip')}</button>
    <div class="field"><textarea id="msgInput" rows="1" placeholder="${off ? 'WhatsApp no está conectado' : 'Escribí un mensaje'}" aria-label="Mensaje" ${off ? 'disabled' : ''}></textarea></div>
    <button class="send rec" id="sendBtn" data-act="grabar" aria-label="Grabar nota de voz" ${off ? 'disabled' : ''}>${ic('mic')}</button>`
  const ta = $('#msgInput')
  ta.value = borradores.get(state.activo) || ''
  autoAlto(ta)
  syncSendBtn()
}

function actualizarComposer() {
  if (state.activo && !state.grabacion && state.composerOff !== !conectado()) renderComposer()
}

function syncSendBtn() {
  const btn = $('#sendBtn')
  const input = $('#msgInput')
  if (!btn || !input) return
  const hayTexto = input.value.trim().length > 0
  btn.classList.toggle('rec', !hayTexto)
  btn.dataset.act = hayTexto ? 'enviar' : 'grabar'
  btn.setAttribute('aria-label', hayTexto ? 'Enviar mensaje' : 'Grabar nota de voz')
  btn.innerHTML = ic(hayTexto ? 'send' : 'mic')
}

async function enviarTexto() {
  const input = $('#msgInput')
  const texto = input?.value.trim()
  const chat = state.activo
  if (!texto || !chat) return
  const citadoId = state.respondiendo
  input.value = ''
  autoAlto(input)
  guardarBorrador(chat, '')
  syncSendBtn()
  state.respondiendo = null
  renderRespuesta()
  state.sinLeerDesde = null
  $('#msgList .sin-leer')?.remove()
  try {
    await api(`/api/chats/${enc(chat)}/texto`, { method: 'POST', json: { texto, citadoId } })
  } catch (err) {
    if (state.activo === chat) {
      input.value = texto
      autoAlto(input)
      guardarBorrador(chat, texto)
      syncSendBtn()
      state.respondiendo = citadoId
      renderRespuesta()
    }
    toast(err.message)
  }
}

async function enviarArchivo(file) {
  if (!file || !state.activo) return
  if (file.size > 60 * 1024 * 1024) return toast('El archivo supera 60 MB.')
  const input = $('#msgInput')
  const texto = input?.value.trim() || ''
  const params = new URLSearchParams({ nombre: file.name })
  if (texto) params.set('texto', texto)
  toast(`Enviando ${file.name}…`, 60000)
  try {
    await api(`/api/chats/${enc(state.activo)}/archivo?${params}`, {
      method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' },
    })
    if (input) {
      input.value = ''
      autoAlto(input)
      guardarBorrador(state.activo, '')
      syncSendBtn()
    }
    toast('Archivo enviado.')
  } catch (err) {
    toast(`No se pudo enviar: ${err.message}`)
  }
}

async function empezarGrabacion() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Este navegador no permite grabar audio.')
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    return toast('Sin permiso para usar el micrófono. Habilitalo desde el candado de la barra de direcciones.')
  }
  const tipo = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t))
  const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined)
  const g = { rec, stream, partes: [], chat: state.activo, inicio: Date.now(), fin: 0, enviar: false }
  rec.ondataavailable = (e) => e.data.size && g.partes.push(e.data)
  rec.onstop = async () => {
    clearInterval(g.timer)
    stream.getTracks().forEach((t) => t.stop())
    state.grabacion = null
    renderComposer()
    if (!g.enviar) return
    const segundos = Math.round((g.fin - g.inicio) / 1000)
    const blob = new Blob(g.partes, { type: rec.mimeType || 'audio/webm' })
    if (segundos < 1 || blob.size < 1000) return toast('La grabación es demasiado corta.')
    toast('Enviando nota de voz…', 60000)
    try {
      await api(`/api/chats/${enc(g.chat)}/nota-voz?segundos=${segundos}`, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type } })
      toast('Nota de voz enviada.')
    } catch (err) {
      toast(`No se pudo enviar: ${err.message}`)
    }
  }
  g.timer = setInterval(() => {
    const t = $('#recT')
    if (t) t.textContent = fmtDur((Date.now() - g.inicio) / 1000)
  }, 250)
  state.grabacion = g
  rec.start(250)
  renderComposer()
}

function terminarGrabacion(enviar) {
  const g = state.grabacion
  if (!g) return
  g.enviar = enviar
  g.fin = Date.now()
  g.rec.stop()
}

/* ---------------- Conexión ---------------- */

const TEXTO_CONEXION = {
  iniciando: ['info', 'Iniciando el servicio…'],
  conectando: ['wait', 'Conectando con WhatsApp…'],
  qr: ['off', 'Esperando que escanees el código'],
  conectado: ['', 'Conectada · recibiendo y enviando mensajes'],
  desconectado: ['off', 'Desconectada'],
  servicio: ['off', 'El servicio local no responde'],
}

function renderPill() {
  const { conexion, yo } = state.conn
  const [cls, texto] = TEXTO_CONEXION[conexion] || TEXTO_CONEXION.iniciando
  const etiqueta = conexion === 'conectado' ? `Conectada · ${yo?.telefono || ''}` : conexion === 'qr' ? 'Sin vincular' : texto
  $('#linePill').innerHTML = `<span class="dot ${cls}"></span><span class="tnum">${esc(etiqueta)}</span>`

  const banner = $('#banner')
  if (conexion === 'conectado' || state.view === 'connect') {
    banner.hidden = true
    return
  }
  let mensaje
  if (conexion === 'servicio') mensaje = 'No hay conexión con el servicio local. Revisá que <b>npm start</b> siga corriendo en Whatsapp/servidor.'
  else if (conexion === 'qr') mensaje = 'La línea no está vinculada: podés ver los chats guardados, pero no enviar.'
  else mensaje = `${esc(texto)} Mientras tanto podés ver los chats guardados.`
  banner.innerHTML = `<span>${mensaje}</span>${conexion === 'servicio' ? '' : '<button class="btn ghost" data-view="connect">Ir a Conexión</button>'}`
  banner.hidden = false
}

function renderConexion() {
  const { conexion, qr, yo, intentos, numeroLinea, rechazo } = state.conn
  const [cls, texto] = TEXTO_CONEXION[conexion] || TEXTO_CONEXION.iniciando
  const acciones = conexion === 'conectado'
    ? `<button class="btn ghost" data-act="reconectar">${ic('refresh')}Reconectar</button><button class="btn ghost" data-act="desvincular">${ic('unlink')}Desvincular</button>`
    : conexion === 'desconectado' ? `<button class="btn primary" data-act="reconectar">${ic('refresh')}Reconectar</button>` : ''

  $('#lineaCard').innerHTML = `
    <h2>Línea de WhatsApp</h2>
    <p class="card-sub">El número de la concesionaria. Se vincula una sola vez y lo usan todos.</p>
    <div class="status-row">
      <span class="avatar">${ic('phone')}</span>
      <div>
        <div class="phone tnum">${esc(conexion === 'conectado' ? yo?.telefono || yo?.id : 'Sin vincular')}</div>
        <div class="state"><span class="dot ${cls}"></span>${esc(texto)}${conexion === 'conectando' && intentos ? ` · intento ${intentos}` : ''}</div>
      </div>
      <div class="actions">${acciones}</div>
    </div>
    ${conexion === 'conectado' && yo?.nombre ? `<p class="path">Nombre de la cuenta: ${esc(yo.nombre)}</p>` : ''}`

  let cuerpo
  if (conexion === 'conectado') {
    cuerpo = `<div class="conn-ok">${ic('circle-check')}<div>La línea está vinculada.</div></div>`
  } else if (conexion === 'qr' && !qr) {
    cuerpo = `<div class="conn-ok">${ic('clock')}<div>Generando el código…</div></div>`
  } else if (conexion === 'qr') {
    const aviso = rechazo && Date.now() - rechazo.ts < 10 * 60 * 1000
      ? `<div class="conn-error">${ic('unlink')}<div>Se escaneó con <b class="tnum">${esc(rechazo.telefono)}</b>, que no es el número de la concesionaria. No se vinculó.</div></div>`
      : ''
    cuerpo = `${aviso}
      <div class="qr-wrap">
        <div class="qr"><img class="qr-img" src="${qr}" alt="Código QR para vincular WhatsApp"></div>
        <div class="stack">
          <ol class="steps">
            <li>Abrí <b>WhatsApp</b> en el celular ${numeroLinea ? `de la concesionaria (<b class="tnum">${esc(numeroLinea)}</b>)` : 'de la concesionaria'}.</li>
            <li>Tocá <b>⋮</b> (Android) o <b>Configuración</b> (iPhone) y entrá a <b>Dispositivos vinculados</b>.</li>
            <li>Tocá <b>Vincular un dispositivo</b> y escaneá este código.</li>
          </ol>
          <p class="timer">El código se renueva solo cada unos segundos.${numeroLinea ? ' Con otro número no se vincula.' : ''}</p>
        </div>
      </div>`
  } else {
    cuerpo = `<div class="conn-ok">${ic('clock')}<div>${esc(texto)}</div></div>`
  }
  $('#vincularCard').innerHTML = `<h2>Vincular WhatsApp</h2>${cuerpo}`
}

function renderLog() {
  const clase = { ok: '', info: 'info', aviso: 'wait', error: 'off' }
  $('#logList').innerHTML = state.logs.length
    ? state.logs.slice(0, 100).map((l) => {
        const d = new Date(l.ts)
        return `<li><time>${pad(d.getHours())}:${pad(d.getMinutes())}</time><span class="dot ${clase[l.nivel] ?? 'info'}"></span><div>${esc(l.texto)}${l.detalle || l.quien ? `<small>${esc([l.detalle, l.quien].filter(Boolean).join(' · '))}</small>` : ''}</div></li>`
      }).join('')
    : '<li style="display:block">Sin actividad todavía.</li>'
}

async function cargarUso() {
  // Sin línea vinculada no hay nada que contar: al desvincular se borra la sesión y lo
  // que quedó en disco es de una cuenta que este panel ya no maneja.
  if (!hayLinea()) {
    $('#usoCard').innerHTML = `
      <div class="vacio-card">${ic('unlink')}
        <div><b>No hay ninguna línea vinculada</b>
        <span>Vinculá un teléfono desde el recuadro de arriba para ver los chats y el espacio que ocupan.</span></div>
      </div>`
    return
  }
  try {
    const u = await api('/api/almacenamiento')
    const filas = [
      ['Fotos', u.bytes.media.fotos], ['Videos', u.bytes.media.videos], ['Audios', u.bytes.media.audios],
      ['Documentos', u.bytes.media.documentos], ['Mensajes', u.bytes.mensajes], ['Sesión', u.bytes.sesion],
    ]
    const max = Math.max(1, ...filas.map((f) => f[1]))
    const total = filas.reduce((s, f) => s + f[1], 0)
    $('#usoCard').innerHTML = `
      <div class="facts">
        <div class="fact"><span>Chats</span><b>${fmtNum(u.chats)}</b></div>
        <div class="fact"><span>Mensajes</span><b>${fmtNum(u.mensajes)}</b></div>
        <div class="fact"><span>Eliminados conservados</span><b>${fmtNum(u.eliminados)}</b></div>
        <div class="fact"><span>Total en disco</span><b>${fmtBytes(total)}</b></div>
      </div>
      <div class="uso" style="margin-top:14px">${filas.map(([n, b]) => `<div class="uso-row"><span>${n}</span><div class="uso-bar"><i style="width:${((b / max) * 100).toFixed(1)}%"></i></div><b>${fmtBytes(b)}</b></div>`).join('')}</div>
      <p class="path" style="margin-top:12px">Carpeta: ${esc(u.carpeta)}</p>`
  } catch (err) {
    $('#usoCard').innerHTML = `<p class="path">${esc(err.message)}</p>`
  }
}

function renderPrefs() {
  $$('[data-pref]').forEach((b) => b.setAttribute('aria-checked', String(!!state.config[b.dataset.pref])))
}

function onEstado(nuevo) {
  const antes = state.conn
  const habiaLinea = !!antes.yo
  state.conn = nuevo
  renderPill()

  if (habiaLinea && !nuevo.yo) {
    // Se desvinculó: lo que quedaba en pantalla es de una sesión que ya no existe.
    olvidarBandeja()
    setView('connect')
    toast('Se desvinculó la línea. Escaneá el QR para volver a usar el panel.', 6000)
    return
  }
  if (!habiaLinea && nuevo.yo) {
    // Recién vinculada: se entra a la bandeja, que es a lo que se vino.
    sincronizar()
    setView('inbox')
    return
  }

  if (state.view === 'connect') {
    const img = $('.qr-img')
    if (antes.conexion === 'qr' && nuevo.conexion === 'qr' && img && nuevo.qr) img.src = nuevo.qr
    else renderConexion()
  }
  $('#tabInbox').disabled = !hayLinea()
  actualizarComposer()
}

/** Sale del chat abierto y vuelve a la pantalla de bienvenida, como Esc en WhatsApp Web. */
function cerrarChat() {
  if (!state.activo) return
  if (!$('#msgInput')?.value.trim()) guardarBorrador(state.activo, '')
  avisarViendo(null)
  detenerAudios()
  cerrarMenu()
  cerrarInfo()
  state.activo = null
  state.mensajes = new Map()
  state.respondiendo = null
  $('#viewInbox').classList.remove('open')
  $('#convEmpty').hidden = false
  for (const sel of ['#convHead', '#messages', '#composer']) $(sel).hidden = true
  renderRespuesta()
  renderList()
}

/** Deja la bandeja en blanco: se usa al desvincular. */
function olvidarBandeja() {
  state.chats = new Map()
  state.mensajes = new Map()
  state.activo = null
  state.revelados.clear()
  state.presencias.clear()
  cerrarMenu()
  $('#viewInbox').classList.remove('open')
  $('#convEmpty').hidden = false
  for (const sel of ['#convHead', '#messages', '#composer']) $(sel).hidden = true
  renderList()
}

function onPresencia({ chatId, estado, visto }) {
  state.presencias.set(chatId, { estado, visto, recibido: Date.now() })
  pedirLista()
  if (chatId === state.activo) renderHead()
}

/* ---------------- Vistas, tema y eventos en vivo ---------------- */

/**
 * Sin línea vinculada no hay bandeja que mostrar: los chats guardados son de una sesión
 * que ya no existe. Hasta vincular, el panel queda en Conexión.
 */
const hayLinea = () => !!state.conn.yo

function setView(view) {
  if (view === 'inbox' && !hayLinea()) view = 'connect'
  state.view = view
  $('#viewInbox').hidden = view !== 'inbox'
  $('#viewConnect').hidden = view !== 'connect'
  $('#tabInbox').setAttribute('aria-selected', String(view === 'inbox'))
  $('#tabConnect').setAttribute('aria-selected', String(view === 'connect'))
  const sinLinea = !hayLinea()
  $('#tabInbox').disabled = sinLinea
  $('#tabInbox').title = sinLinea ? 'Vinculá la línea para ver los chats' : ''
  cerrarMenu()
  if (view === 'connect') {
    renderConexion()
    renderLog()
    renderPrefs()
    cargarUso()
  }
  renderPill()
}

function esOscuro() {
  const t = document.documentElement.dataset.theme
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
}
function syncTema() {
  $$('[data-act="theme"]').forEach((b) => (b.innerHTML = ic(esOscuro() ? 'sun' : 'moon')))
}

async function sincronizar() {
  try {
    const [estado, chats, logs] = await Promise.all([api('/api/estado'), api('/api/chats'), api('/api/log')])
    state.config = estado.config
    state.logs = logs
    state.chats = new Map(chats.map((c) => [c.id, c]))
    onEstado(estado)
    renderList()
    renderPrefs()
    if (state.view === 'connect') renderLog()
    if (state.activo) abrirChat(state.activo)
  } catch {
    onEstado({ ...state.conn, conexion: 'servicio' })
  }
}

function conectarEventos() {
  const es = new EventSource(`/api/eventos?pestana=${PESTANA}`)
  es.addEventListener('open', () => {
    sincronizar()
    // Tras un corte el servidor olvidó qué chat tenía abierto esta pestaña.
    if (state.activo) avisarViendo(state.activo)
  })
  es.addEventListener('agentes', (e) => {
    state.agentes = JSON.parse(e.data)
    renderYo()
    pedirLista()
    if (state.activo) renderHead()
  })
  es.addEventListener('error', () => {
    if (es.readyState !== EventSource.OPEN) onEstado({ ...state.conn, conexion: 'servicio' })
  })
  es.addEventListener('estado', (e) => onEstado(JSON.parse(e.data)))
  es.addEventListener('chat', (e) => {
    const c = JSON.parse(e.data)
    state.chats.set(c.id, c)
    pedirLista()
    if (c.id === state.activo) renderHead()
  })
  es.addEventListener('chat-migrado', (e) => {
    const { de, a } = JSON.parse(e.data)
    state.chats.delete(de)
    pedirLista()
    if (state.activo === de) abrirChat(a)
  })
  es.addEventListener('foto', (e) => {
    const { id, ts } = JSON.parse(e.data)
    // Los avatares de los integrantes del grupo no son chats: se actualizan en el lugar.
    for (const av of document.querySelectorAll(`.avatar[data-jid="${CSS.escape(id)}"]`)) {
      if (av.querySelector('img')) continue
      av.insertAdjacentHTML('beforeend', `<img src="/api/chats/${enc(id)}/foto?v=${ts}" alt="" loading="lazy">`)
    }
  })
  es.addEventListener('mensaje', (e) => onMensaje(JSON.parse(e.data)))
  es.addEventListener('presencia', (e) => onPresencia(JSON.parse(e.data)))
  es.addEventListener('log', (e) => {
    state.logs.unshift(JSON.parse(e.data))
    if (state.view === 'connect') renderLog()
  })
  es.addEventListener('config', (e) => {
    state.config = JSON.parse(e.data)
    renderPrefs()
  })
}

/* Click derecho: menú del mensaje sobre una burbuja, menú del chat sobre una fila. */
document.addEventListener('contextmenu', (e) => {
  const burbuja = e.target.closest('.msg')
  const fila = e.target.closest('[data-chat]')
  if (!burbuja && !fila) return // fuera de la app queda el menú del navegador
  e.preventDefault()
  if (burbuja) {
    const id = burbuja.dataset.id
    const m = state.mensajes.get(id)
    if (m && m.tipo !== 'desconocido') abrirMenu(id, puntoDe(e))
    return
  }
  abrirMenuChat(fila.dataset.chat, puntoDe(e))
})

document.addEventListener('click', async (e) => {
  if (seleccion.activa) {
    const burbuja = e.target.closest('.msg')
    if (burbuja && !e.target.closest('[data-act]')) return alternarSeleccion(burbuja.dataset.id)
  }
  const enMenu = e.target.closest('#menuMsg, #menuChat, [data-opciones]')
  if (!enMenu) cerrarMenu()
  if (!e.target.closest('#emojiPanel, #emojiBtn')) cerrarEmojis()
  const emo = e.target.closest('[data-emoji]')
  if (emo) return ponerEmoji(emo.dataset.emoji)
  const t = e.target.closest('[data-chat],[data-filter],[data-play],[data-seek],[data-ver],[data-view],[data-act],[data-pref],[data-descargar],[data-opciones],[data-reaccionar],[data-cita],[data-velocidad],[data-revelar],[data-chat-act],[data-persona],[data-info-tab],[data-res],[data-fwd],[data-bajar]')
  if (!t) {
    if (e.target.id === 'lightbox') $('#lightbox').hidden = true
    return
  }
  if (t.dataset.opciones) {
    if (state.menuBoton === t) return cerrarMenu()
    return abrirMenu(t.dataset.opciones, t.getBoundingClientRect(), t)
  }
  if (t.dataset.revelar) {
    // Destapar o volver a tapar un mensaje eliminado.
    const id = t.dataset.revelar
    if (state.revelados.has(id)) state.revelados.delete(id)
    else state.revelados.add(id)
    const el = document.getElementById(domId(id))
    const m = state.mensajes.get(id)
    if (el && m) el.outerHTML = msgHtml(m, el.classList.contains('cola'))
    return
  }
  if (t.dataset.fwd) {
    if (seleccion.destinos.has(t.dataset.fwd)) seleccion.destinos.delete(t.dataset.fwd)
    else seleccion.destinos.add(t.dataset.fwd)
    return renderReenviar($('#fwdBuscar')?.value || '')
  }
  if (t.dataset.bajar) return bajarUno(t.dataset.bajar, t)
  if (t.dataset.res) return irAResultado(t.dataset.res, t.dataset.resMsg)
  if (t.dataset.persona) return cargarInfo(t.dataset.persona)
  if (t.dataset.infoTab) {
    info.tab = t.dataset.infoTab
    return renderInfo()
  }
  if (t.dataset.chatAct) {
    // El mismo botón sirve en el menú del click derecho y en la ficha del chat.
    const id = t.closest('#menuChat') ? $('#menuChat').dataset.chat : state.activo
    return accionChat(id, t.dataset.chatAct, t.dataset.valor)
  }
  if (t.dataset.reaccionar) {
    const id = $('#menuMsg').dataset.msg
    cerrarMenu()
    return reaccionar(id, t.dataset.reaccionar)
  }
  if (t.dataset.cita) return irAMensaje(t.dataset.cita)
  if (t.dataset.velocidad) {
    const id = t.dataset.velocidad
    const actual = state.velocidades.get(id) || 1
    const siguiente = VELOCIDADES[(VELOCIDADES.indexOf(actual) + 1) % VELOCIDADES.length]
    state.velocidades.set(id, siguiente)
    if (audios.has(id)) audios.get(id).playbackRate = siguiente
    t.textContent = etiquetaVelocidad(siguiente)
    return
  }
  if (t.dataset.descargar) {
    const chat = state.activo
    t.disabled = true
    try {
      const mensaje = await api(`/api/chats/${enc(chat)}/media/${enc(t.dataset.descargar)}/descargar`, { method: 'POST' })
      if (state.activo === chat) onMensaje({ chatId: chat, mensaje })
    } catch (err) {
      toast(err.message)
      t.disabled = false
    }
    return
  }
  if (t.dataset.chat) {
    if (state.activo && state.activo !== t.dataset.chat) guardarBorrador(state.activo, $('#msgInput')?.value || '')
    return abrirChat(t.dataset.chat)
  }
  if (t.dataset.filter) {
    state.filter = t.dataset.filter
    return renderList()
  }
  if (t.dataset.play) {
    const id = t.dataset.play
    for (const [otro, a] of audios) if (otro !== id) a.pause()
    const a = audioDe(id)
    if (a.paused) a.play().catch(() => toast('No se pudo reproducir el audio.'))
    else a.pause()
    return
  }
  if (t.dataset.seek) {
    const id = t.dataset.seek
    const a = audioDe(id)
    const total = (Number.isFinite(a.duration) && a.duration) || state.mensajes.get(id)?.media?.segundos || 0
    const r = t.getBoundingClientRect()
    if (total) a.currentTime = total * Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    return actualizarVoz(id)
  }
  if (t.dataset.ver) {
    $('#lbFig').innerHTML = `<img src="${t.dataset.ver}" alt="Foto ampliada">`
    $('#lightbox').hidden = false
    return
  }
  if (t.dataset.view) return setView(t.dataset.view)
  if (t.dataset.pref) {
    const k = t.dataset.pref
    try {
      state.config = await api('/api/config', { method: 'POST', json: { [k]: !state.config[k] } })
      renderPrefs()
    } catch (err) {
      toast(err.message)
    }
    return
  }

  switch (t.dataset.act) {
    case 'theme':
      document.documentElement.dataset.theme = esOscuro() ? 'light' : 'dark'
      guardarLocal('wa-tema', document.documentElement.dataset.theme)
      syncTema()
      break
    case 'responder':
      state.respondiendo = $('#menuMsg').dataset.msg
      cerrarMenu()
      renderRespuesta()
      $('#msgInput')?.focus()
      break
    case 'copiar': {
      const m = state.mensajes.get($('#menuMsg').dataset.msg)
      cerrarMenu()
      try {
        await navigator.clipboard.writeText(m?.texto || '')
        toast('Texto copiado.')
      } catch {
        toast('No se pudo copiar el texto.')
      }
      break
    }
    case 'ir-citado': {
      const m = state.mensajes.get($('#menuMsg').dataset.msg)
      cerrarMenu()
      if (m?.citado) irAMensaje(m.citado)
      break
    }
    case 'ver-eliminado': {
      const id = $('#menuMsg').dataset.msg
      cerrarMenu()
      if (state.revelados.has(id)) state.revelados.delete(id)
      else state.revelados.add(id)
      const el = document.getElementById(domId(id))
      const m = state.mensajes.get(id)
      if (el && m) el.outerHTML = msgHtml(m, el.classList.contains('cola'))
      break
    }
    case 'destacar': {
      const id = $('#menuMsg').dataset.msg
      const m = state.mensajes.get(id)
      cerrarMenu()
      if (!m) break
      try {
        const act = await api(`/api/chats/${enc(state.activo)}/destacar`, { method: 'POST', json: { id, destacar: !m.destacado } })
        onMensaje({ chatId: state.activo, mensaje: act })
        toast(act.destacado ? 'Mensaje destacado, también en el celular.' : 'Se quitó el destacado.')
      } catch (err) {
        toast(err.message)
      }
      break
    }
    case 'info-msg': {
      const m = state.mensajes.get($('#menuMsg').dataset.msg)
      cerrarMenu()
      if (m) infoMensaje(m)
      break
    }
    case 'eliminar-msg': {
      const id = $('#menuMsg').dataset.msg
      cerrarMenu()
      if (!confirm('¿Eliminar este mensaje para todos? Desaparece del chat del contacto; acá queda guardado el original.')) break
      try {
        const act = await api(`/api/chats/${enc(state.activo)}/eliminar`, { method: 'POST', json: { id } })
        onMensaje({ chatId: state.activo, mensaje: act })
        toast('Mensaje eliminado para todos. El original queda en el respaldo.')
      } catch (err) {
        toast(err.message)
      }
      break
    }
    case 'reenviar': {
      const id = $('#menuMsg').dataset.msg
      entrarSeleccion(id)
      abrirReenviar()
      break
    }
    case 'seleccionar':
      entrarSeleccion($('#menuMsg').dataset.msg)
      break
    case 'sel-salir': salirSeleccion(); break
    case 'sel-reenviar': abrirReenviar(); break
    case 'sel-destacar': await accionEnLote('destacar'); break
    case 'sel-eliminar': await accionEnLote('eliminar'); break
    case 'fwd-cancelar': $('#fwdDlg').close(); break
    case 'fwd-enviar': await confirmarReenvio(); break
    case 'buscar-chat':
      buscarEnChat()
      break
    case 'salir-busqueda':
      salirDeBusqueda()
      break
    case 'info-chat':
      alternarInfo()
      break
    case 'bajar-todo': {
      const f = info.ficha
      if (!f) break
      try {
        const r = await api(`/api/chats/${enc(f.id)}/descargar-todo`, { method: 'POST', json: { reintentar: !!t.dataset.reintentar } })
        if (r.encolados) toast(`Bajando ${fmtNum(r.encolados)} archivos. Van apareciendo de a poco.`)
        else if (r.perdidos) toast(`Los ${fmtNum(r.perdidos)} que faltan ya no están en WhatsApp. Podés probar de nuevo con "Reintentar".`, 6000)
        else toast('No hay nada pendiente.')
      } catch (err) {
        toast(err.message)
      }
      break
    }
    case 'info-archivos':
      info.vista = 'media'
      renderInfo()
      break
    case 'info-volver':
      // Desde la galería se vuelve a la ficha; desde la ficha de otra persona, al chat.
      if (info.vista === 'media') {
        info.vista = 'ficha'
        renderInfo()
      } else {
        cargarInfo()
      }
      break
    case 'salir-grupo': {
      const f = info.ficha
      if (!f?.esGrupo) break
      if (!confirm(`¿Salir de "${f.nombre}"? Dejás de recibir sus mensajes. La conversación guardada queda acá.`)) break
      try {
        await api(`/api/chats/${enc(f.id)}/salir`, { method: 'POST' })
        toast('Saliste del grupo. La conversación queda guardada.')
        cargarInfo()
      } catch (err) {
        toast(err.message)
      }
      break
    }
    case 'cerrar-info':
      cerrarInfo()
      break
    case 'emojis':
      abrirEmojis(t)
      break
    case 'cancelar-respuesta':
      state.respondiendo = null
      renderRespuesta()
      break
    case 'ver-archivados':
      state.verArchivados = true
      renderList()
      $('#chatList').scrollTop = 0
      break
    case 'salir-archivados':
      state.verArchivados = false
      renderList()
      $('#chatList').scrollTop = 0
      break
    case 'bajar': irAbajo(); break
    case 'nuevo-chat':
      $('#nuevoErr').hidden = true
      $('#dlgNuevo').showModal()
      break
    case 'cerrar-dlg': $('#dlgNuevo').close(); break
    case 'volver':
      $('#viewInbox').classList.remove('open')
      avisarViendo(null)
      break
    case 'salir-sesion':
      await salirDeSesion()
      break
    case 'adjuntar': $('#fileInput').click(); break
    case 'grabar': empezarGrabacion(); break
    case 'enviar': enviarTexto(); break
    case 'rec-cancelar': terminarGrabacion(false); break
    case 'rec-enviar': terminarGrabacion(true); break
    case 'reconectar':
      api('/api/reconectar', { method: 'POST' }).catch((err) => toast(err.message))
      break
    case 'desvincular':
      if (confirm('¿Desvincular este WhatsApp? Los chats guardados no se borran. Para volver a usar la línea hay que escanear el QR de nuevo.')) {
        api('/api/desvincular', { method: 'POST' }).then(() => toast('Línea desvinculada.')).catch((err) => toast(err.message))
      }
      break
    case 'sincronizar-grupos':
      t.disabled = true
      toast('Trayendo los grupos de WhatsApp…', 60000)
      try {
        const r = await api('/api/sincronizar-grupos', { method: 'POST' })
        toast(r.nuevos ? `Listo: ${r.grupos} grupos, ${r.nuevos} nuevos en la bandeja.` : `Listo: ${r.grupos} grupos, ninguno nuevo.`)
        sincronizar()
      } catch (err) {
        toast(err.message)
      } finally {
        t.disabled = false
      }
      break
    case 'sincronizar-chats':
      t.disabled = true
      toast('Sincronizando chats con WhatsApp…', 120000)
      try {
        const r = await api('/api/sincronizar-chats', { method: 'POST' })
        toast(`Listo: ${r.archivados} archivados y ${r.fijados} fijados.`)
      } catch (err) {
        toast(err.message)
      } finally {
        t.disabled = false
      }
      break
    case 'uso': cargarUso(); break
    case 'lb-close':
      $('#lightbox').hidden = true
      $('#lbFig').innerHTML = ''
      break
  }
})

document.addEventListener('submit', async (e) => {
  if (e.target.id === 'formNuevo') {
    e.preventDefault()
    const errEl = $('#nuevoErr')
    errEl.hidden = true
    $('#nuevoOk').disabled = true
    try {
      const { id } = await api('/api/chats', { method: 'POST', json: { telefono: $('#nuevoTel').value } })
      $('#dlgNuevo').close()
      $('#nuevoTel').value = ''
      setView('inbox')
      abrirChat(id)
    } catch (err) {
      errEl.textContent = err.message
      errEl.hidden = false
    } finally {
      $('#nuevoOk').disabled = false
    }
  }
})

document.addEventListener('input', (e) => {
  if (e.target.id === 'search') alBuscar(e.target.value)
  if (e.target.id === 'fwdBuscar') renderReenviar(e.target.value)
  if (e.target.id === 'msgInput') {
    autoAlto(e.target)
    syncSendBtn()
    guardarBorrador(state.activo, e.target.value)
  }
})

document.addEventListener('keydown', (e) => {
  // Enter envía; Shift+Enter hace un salto de línea, como en WhatsApp Web.
  if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'msgInput' && !e.isComposing) {
    e.preventDefault()
    enviarTexto()
  }
  if (e.key === 'Escape') {
    if (!$('#lightbox').hidden) $('#lightbox').hidden = true
    else if (!$('#emojiPanel').hidden) cerrarEmojis()
    else if (!$('#infoPane').hidden) cerrarInfo()
    else if (seleccion.activa) salirSeleccion()
    else if (!$('#menuMsg').hidden || !$('#menuChat').hidden) cerrarMenu()
    else if (state.respondiendo) {
      state.respondiendo = null
      renderRespuesta()
    } else if (state.activo) cerrarChat()
  }
})

// Foto que no se pudo abrir: el avatar vuelve a las iniciales y el mensaje muestra un aviso en vez del ícono roto.
document.addEventListener('error', (e) => {
  const el = e.target
  if (el instanceof HTMLImageElement && el.closest('.avatar')) {
    el.remove()
    return
  }
  if (!(el instanceof HTMLImageElement || el instanceof HTMLVideoElement) || !el.closest('#messages')) return
  const aviso = document.createElement('div')
  aviso.className = 'media-missing'
  aviso.innerHTML = `${ic('alert')}<span>No se pudo abrir el archivo. Si es un mensaje viejo, WhatsApp puede haberlo borrado de sus servidores.</span>`
  ;(el.closest('.media-img') || el).replaceWith(aviso)
}, true)

$('#fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0]
  e.target.value = ''
  enviarArchivo(file)
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.activo) marcarLeido(state.activo)
})
window.addEventListener('resize', cerrarMenu)

// Vence el "escribiendo…" de quien dejó de escribir sin avisar.
setInterval(() => {
  if (![...state.presencias.values()].some((p) => ['composing', 'recording'].includes(p.estado))) return
  pedirLista()
  if (state.activo) renderHead()
}, 10000)

/* ---------------- Inicio ---------------- */
// Embebido manda el tema del CRM (llega por mensaje); suelto, el que eligió la persona.
const tema = EMBEBIDO ? null : leerLocal('wa-tema', null)
if (tema) document.documentElement.dataset.theme = tema
document.documentElement.classList.toggle('embebido', EMBEBIDO)
syncTema()
setView('inbox')
renderList()
entrar()
  .then((ok) => ok && conectarEventos())
  .catch(() => pantallaSinSesion({ error: 'No se pudo conectar con el servidor del WhatsApp.' }))
