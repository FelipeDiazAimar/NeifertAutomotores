/* Bandeja de WhatsApp (prueba local). Habla con el servidor en /api y recibe los cambios en vivo por /api/eventos. */

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
  grabacion: null, codigo: null, composerOff: null,
}
const borradores = new Map(Object.entries(leerLocal('wa-borradores', {})))
const conectado = () => state.conn.conexion === 'conectado'

async function api(ruta, { method = 'GET', json, body, headers } = {}) {
  const res = await fetch(ruta, {
    method,
    headers: json ? { 'Content-Type': 'application/json' } : headers,
    body: json ? JSON.stringify(json) : body,
  })
  const data = await res.json().catch(() => ({}))
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
  ubicacion: ['pin', 'Ubicación'], contacto: ['user', 'Contacto'],
}

function iniciales(c) {
  const n = c?.nombre || ''
  if (!n || n.startsWith('+') || /^\d/.test(n)) return ic('user')
  return esc(n.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase())
}
function avatarHtml(c) {
  const foto = c?.foto ? `<img src="/api/chats/${enc(c.id)}/foto?v=${c.foto}" alt="" loading="lazy">` : ''
  return `<span class="avatar">${iniciales(c)}${foto}</span>`
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
  if (u.eliminado) return `<span class="row-prev deleted">${ic('history')}Mensaje eliminado (guardado)</span>`
  const p = PREVIA[u.tipo]
  const texto = u.texto ? esc(sinFormato(u.texto)) : p ? p[1] : ''
  return `<span class="row-prev">${u.deMi ? tickHtml(u.estado) : ''}${p ? ic(p[0]) : ''}${texto}</span>`
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

function filaChat(c) {
  const sub = c.telefono && c.nombre !== c.telefono ? `<span class="row-sub tnum">${esc(c.telefono)}</span>` : ''
  const iconos = [
    c.silenciado ? ic('mute') : '',
    c.fijado && !c.archivado ? ic('fijado') : '',
    c.noLeidos ? `<span class="unread tnum">${c.noLeidos}</span>` : '',
  ].join('')
  const clases = ['row', c.id === state.activo && 'active', c.noLeidos && 'has-unread', c.silenciado && 'silenciado'].filter(Boolean).join(' ')
  return `<button class="${clases}" data-chat="${esc(c.id)}">
    ${avatarHtml(c)}
    <span class="row-main">
      <span class="row-top"><span class="row-name">${esc(c.nombre)}</span></span>${sub}
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
  $('#chatList').innerHTML = filaArchivados + (filas.length ? filas.map(filaChat).join('') : `<div class="empty">${vacio}</div>`)

  const total = todos.filter((c) => !c.archivado && !c.silenciado).reduce((s, c) => s + (c.noLeidos || 0), 0)
  document.title = `${total ? `(${total}) ` : ''}WhatsApp Neifert · Prueba local`
}

/* ---------------- Conversación ---------------- */

async function abrirChat(id) {
  const chat = state.chats.get(id)
  state.activo = id
  state.mensajes = new Map()
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

function subtituloChat(c) {
  const actividad = actividadDe(c.id)
  if (actividad) return `<span class="estado-escribiendo">${actividad}</span>`
  const p = state.presencias.get(c.id)
  if (p && ['available', 'composing', 'recording', 'paused'].includes(p.estado)) return '<span class="estado-en-linea">en línea</span>'
  if (p?.visto) return `<span class="tnum">últ. vez ${diaDe(p.visto).toLowerCase()} a las ${hora(p.visto)}</span>`
  const partes = []
  if (c.telefono && c.nombre !== c.telefono) partes.push(c.telefono)
  if (c.id.endsWith('@lid')) partes.push('WhatsApp no compartió el número')
  return `<span class="tnum">${esc(partes.join(' · ') || 'toca para ver el número')}</span>`
}

function renderHead() {
  const c = state.chats.get(state.activo) || { id: state.activo, nombre: state.activo }
  $('#convHead').innerHTML = `
    <button class="icon-btn back-btn" data-act="volver" aria-label="Volver a la lista">${ic('back')}</button>
    ${avatarHtml(c)}
    <div class="who"><b>${esc(c.nombre)}</b>${subtituloChat(c)}</div>
    ${c.silenciado ? `<span class="tag">${ic('mute')} Silenciado</span>` : ''}
    ${c.archivado ? `<span class="tag">${ic('archive')} Archivado</span>` : ''}`
}

const ordenados = () => [...state.mensajes.values()].sort((a, b) => a.ts - b.ts)
const esAudio = (m) => m.tipo === 'nota_voz' || m.tipo === 'audio'
const urlMedia = (m) => `/api/chats/${enc(state.activo)}/media/${enc(m.id)}?e=${m.media?.estado || ''}`
const diaHtml = (d) => `<div class="day" data-dia="${esc(d)}">${esc(d)}</div>`
const sinLeerHtml = (n) => `<div class="sin-leer">${n === 1 ? '1 mensaje no leído' : `${n} mensajes no leídos`}</div>`

/** Dibuja los últimos `state.visibles` mensajes. Con mantenerPosicion no mueve lo que se está leyendo. */
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
    const ladoActual = m.deMi ? 'out' : 'in'
    partes.push(msgHtml(m, ladoActual !== lado))
    lado = ladoActual
  }
  lista.innerHTML = partes.length ? partes.join('') : '<div class="sys" data-vacio>Todavía no hay mensajes en este chat. Escribí el primero.</div>'
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
  const cola = !(ultimo?.classList.contains('msg') && ultimo.classList.contains(mensaje.deMi ? 'out' : 'in'))
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

function autorDe(m) {
  return m.deMi ? 'Vos' : state.chats.get(state.activo)?.nombre || 'Contacto'
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
  const visual = md?.estado === 'ok' && ['imagen', 'video', 'gif'].includes(m.tipo)
  const sticker = md?.estado === 'ok' && m.tipo === 'sticker'
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
    else if (m.texto) {
      const grande = !md && m.tipo === 'texto' && soloEmojis(m.texto)
      texto = `<div class="txt ${grande ? 'emoji-grande' : ''}">${m.tipo === 'otro' ? `<i>${esc(m.texto)}</i>` : formatear(m.texto)}</div>`
    }
  }

  const eliminado = m.eliminado
    ? `<div class="del-note">${ic('history')}<span>${m.eliminado.por === 'yo' ? 'Eliminado desde la línea' : 'El contacto lo eliminó'} a las ${hora(m.eliminado.ts)}. Se conserva el original.</span></div>`
    : ''
  const ediciones = m.ediciones?.length
    ? `<details class="ediciones"><summary>${m.ediciones.length === 1 ? 'Ver versión anterior' : `Ver ${m.ediciones.length} versiones anteriores`}</summary><ul>${m.ediciones
        .map((e) => `<li>${esc(e.texto) || '<i>(vacío)</i>'} <span class="tnum">· cambiado a las ${hora(e.ts)}</span></li>`)
        .join('')}</ul></details>`
    : ''
  const reacciones = m.reacciones ? Object.values(m.reacciones).filter(Boolean) : []
  const reacts = reacciones.length ? `<div class="reacts" aria-label="Reacciones">${reacciones.map(esc).join('')}</div>` : ''
  const meta = `<div class="meta">${m.ediciones?.length ? '<span class="edited">editado</span>' : ''}<span class="tnum">${hora(m.ts)}</span>${m.deMi ? iconoEstado(m.estado) : ''}</div>`
  const opciones = m.tipo === 'desconocido' ? '' : `<button class="opciones" data-opciones="${esc(m.id)}" aria-label="Opciones del mensaje" aria-haspopup="menu" aria-expanded="false">${ic('down')}</button>`

  // Distribución de la hora dentro de la burbuja, igual que WhatsApp.
  let distribucion
  if (sticker) distribucion = 'sticker-msg'
  else if (visual) distribucion = texto && !ediciones ? 'con-media con-texto' : texto ? 'con-media sin-texto' : 'solo-media'
  else distribucion = texto && !ediciones ? 'con-texto' : 'sin-texto'

  const clases = [
    'msg', m.deMi ? 'out' : 'in', distribucion,
    cola && 'cola',
    m.ediciones?.length && 'editado',
    m.eliminado && 'deleted',
    reacciones.length && 'has-reacts',
    m.tipo === 'desconocido' && 'desconocido',
  ].filter(Boolean).join(' ')
  return `<div class="${clases}" id="${domId(m.id)}">${opciones}${eliminado}${cuerpo}${texto}${ediciones}${meta}${reacts}</div>`
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

/* ---------------- Menú del mensaje ---------------- */

function abrirMenu(id, boton) {
  const m = state.mensajes.get(id)
  if (!m) return
  cerrarMenu()
  const menu = $('#menuMsg')
  const mia = m.reacciones?.yo
  menu.innerHTML = `
    <div class="reac-bar">${REACCIONES.map((e) => `<button data-reaccionar="${e}" aria-pressed="${mia === e}" aria-label="Reaccionar con ${e}">${e}</button>`).join('')}</div>
    <button class="item" role="menuitem" data-act="responder">${ic('reply')}Responder</button>
    ${m.texto ? `<button class="item" role="menuitem" data-act="copiar">${ic('copy')}Copiar texto</button>` : ''}
    ${m.media?.estado === 'ok' ? `<a class="item" role="menuitem" style="color:inherit;text-decoration:none" href="${urlMedia(m)}&descargar=1" target="_blank" rel="noopener">${ic('download')}Descargar</a>` : ''}`
  menu.dataset.msg = id
  menu.hidden = false
  const r = boton.getBoundingClientRect()
  const ancho = menu.offsetWidth
  const alto = menu.offsetHeight
  const izquierda = Math.max(8, Math.min(m.deMi ? r.right - ancho : r.left, innerWidth - ancho - 8))
  let arriba = r.bottom + 4
  if (arriba + alto > innerHeight - 8) arriba = r.top - alto - 4
  menu.style.left = `${izquierda}px`
  menu.style.top = `${Math.max(8, arriba)}px`
  boton.setAttribute('aria-expanded', 'true')
  state.menuBoton = boton
}

function cerrarMenu() {
  const menu = $('#menuMsg')
  if (menu.hidden) return
  menu.hidden = true
  state.menuBoton?.setAttribute('aria-expanded', 'false')
  state.menuBoton = null
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
  const { conexion, qr, yo, intentos } = state.conn
  const [cls, texto] = TEXTO_CONEXION[conexion] || TEXTO_CONEXION.iniciando
  const acciones = conexion === 'conectado'
    ? `<button class="btn ghost" data-act="reconectar">${ic('refresh')}Reconectar</button><button class="btn ghost" data-act="desvincular">${ic('unlink')}Desvincular</button>`
    : conexion === 'desconectado' ? `<button class="btn primary" data-act="reconectar">${ic('refresh')}Reconectar</button>` : ''

  $('#lineaCard').innerHTML = `
    <h2>Línea de WhatsApp</h2>
    <p class="card-sub">El número que vincules es el que se prueba. Conviene usar uno de prueba.</p>
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
    cuerpo = `<div class="conn-ok">${ic('circle-check')}<div>La línea está vinculada. Para probar con otro número, desvinculá primero.</div></div>`
  } else if (conexion === 'qr' && qr) {
    const tel = $('#codigoTel')?.value || ''
    cuerpo = `
      <div class="qr-wrap">
        <div class="qr"><img class="qr-img" src="${qr}" alt="Código QR para vincular WhatsApp"></div>
        <div class="stack">
          <ol class="steps">
            <li>Abrí <b>WhatsApp</b> en el celular que querés vincular.</li>
            <li>Tocá <b>⋮</b> (Android) o <b>Configuración</b> (iPhone) y entrá a <b>Dispositivos vinculados</b>.</li>
            <li>Tocá <b>Vincular un dispositivo</b> y escaneá este código.</li>
          </ol>
          <p class="timer">El código se renueva solo cada unos segundos.</p>
        </div>
      </div>
      <div class="stack">
        <p class="section-label">O vinculá con el número de teléfono</p>
        ${state.codigo
          ? `<div class="pair-code">${esc(state.codigo.slice(0, 4))}-${esc(state.codigo.slice(4))}</div>
             <p class="path">En el celular: Dispositivos vinculados → Vincular un dispositivo → <b>Vincular con número de teléfono</b>, y escribí este código.</p>`
          : ''}
        <form class="pair-form" id="formCodigo">
          <input id="codigoTel" inputmode="tel" placeholder="5493564562413" aria-label="Número con código de país" autocomplete="off" value="${esc(tel)}">
          <button class="btn ghost" type="submit">Pedir código</button>
        </form>
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
        return `<li><time>${pad(d.getHours())}:${pad(d.getMinutes())}</time><span class="dot ${clase[l.nivel] ?? 'info'}"></span><div>${esc(l.texto)}${l.detalle ? `<small>${esc(l.detalle)}</small>` : ''}</div></li>`
      }).join('')
    : '<li style="display:block">Sin actividad todavía.</li>'
}

async function cargarUso() {
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
  state.conn = nuevo
  if (nuevo.conexion !== 'qr') state.codigo = null
  renderPill()
  if (state.view === 'connect') {
    const img = $('.qr-img')
    if (antes.conexion === 'qr' && nuevo.conexion === 'qr' && img && nuevo.qr) img.src = nuevo.qr
    else renderConexion()
  }
  actualizarComposer()
}

function onPresencia({ chatId, estado, visto }) {
  state.presencias.set(chatId, { estado, visto, recibido: Date.now() })
  pedirLista()
  if (chatId === state.activo) renderHead()
}

/* ---------------- Vistas, tema y eventos en vivo ---------------- */

function setView(view) {
  state.view = view
  $('#viewInbox').hidden = view !== 'inbox'
  $('#viewConnect').hidden = view !== 'connect'
  $('#tabInbox').setAttribute('aria-selected', String(view === 'inbox'))
  $('#tabConnect').setAttribute('aria-selected', String(view === 'connect'))
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
  const es = new EventSource('/api/eventos')
  es.addEventListener('open', sincronizar)
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

document.addEventListener('click', async (e) => {
  if (!$('#menuMsg').hidden && !e.target.closest('#menuMsg') && !e.target.closest('[data-opciones]')) cerrarMenu()
  const t = e.target.closest('[data-chat],[data-filter],[data-play],[data-seek],[data-ver],[data-view],[data-act],[data-pref],[data-descargar],[data-opciones],[data-reaccionar],[data-cita],[data-velocidad]')
  if (!t) {
    if (e.target.id === 'lightbox') $('#lightbox').hidden = true
    return
  }
  if (t.dataset.opciones) {
    if (state.menuBoton === t) return cerrarMenu()
    return abrirMenu(t.dataset.opciones, t)
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
    case 'volver': $('#viewInbox').classList.remove('open'); break
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
  if (e.target.id === 'formCodigo') {
    e.preventDefault()
    const btn = e.target.querySelector('button')
    btn.disabled = true
    try {
      const { codigo } = await api('/api/vincular/codigo', { method: 'POST', json: { telefono: $('#codigoTel').value } })
      state.codigo = codigo
      renderConexion()
    } catch (err) {
      toast(err.message)
      btn.disabled = false
    }
  }
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
  if (e.target.id === 'search') {
    state.q = e.target.value
    renderList()
  }
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
    else if (!$('#menuMsg').hidden) cerrarMenu()
    else if (state.respondiendo) {
      state.respondiendo = null
      renderRespuesta()
    }
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
const tema = leerLocal('wa-tema', null)
if (tema) document.documentElement.dataset.theme = tema
syncTema()
setView('inbox')
renderList()
conectarEventos()
