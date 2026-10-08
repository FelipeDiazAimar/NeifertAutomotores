/* Bandeja de WhatsApp de la concesionaria. Habla con el servidor en /api y recibe los cambios en vivo por /api/eventos. */

/*
 * Solo lectura desde la base (NUBE): con la PC servidor apagada, el CRM abre una copia de
 * este panel en /wa-lectura/, que lee los chats guardados en vez de hablar con el servidor.
 * Todo /api/... va a /wa-lectura/api/... y no hay eventos en vivo. Servido por la PC
 * servidor (la ruta normal) esto no cambia nada.
 */
const NUBE = location.pathname.startsWith('/wa-lectura/')
const rutaApi = (ruta) => (NUBE && ruta.startsWith('/api/') ? `/wa-lectura${ruta}` : ruta)
if (NUBE) {
  const fetchOriginal = window.fetch.bind(window)
  window.fetch = (url, opciones) => fetchOriginal(typeof url === 'string' ? rutaApi(url) : url, opciones)
}

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
// Techo de burbujas en pantalla: más arriba de esto, se sacan las más nuevas de abajo.
const MAX_DIBUJADOS = 500
// Mensajes que se piden al servidor por vez (al abrir un chat y al subir más allá).
const PAGINA_SERVIDOR = 400
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

/** Límites de archivos (los informa el servidor): bajar, como WhatsApp (2 GB); mandar desde acá. */
const limiteMb = () => state.config?.mediaMaxMb || 2048
const limiteSubidaMb = () => state.config?.subidaMaxMb || limiteMb()
const textoMb = (mb) => (mb >= 1024 && mb % 1024 === 0 ? `${mb / 1024} GB` : `${mb} MB`)

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
  chats: new Map(), activo: null, mensajes: new Map(), citados: new Map(), hayAnteriores: false, recorte: 0,
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
  if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status, data })
  return data
}

/** Baja un archivo de la API (que exige la cabecera) con el nombre que le pone el servidor. */
async function bajarArchivo(ruta, porDefecto) {
  const res = await fetch(ruta, { headers: CABECERA })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Error ${res.status}`)
  }
  const disp = res.headers.get('content-disposition') || ''
  const m = /filename\*=UTF-8''([^;]+)/i.exec(disp) || /filename="([^"]+)"/i.exec(disp)
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: m ? decodeURIComponent(m[1]) : porDefecto })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

let toastTimer
function toast(texto, ms = 3200) {
  const el = $('#toast')
  el.textContent = texto
  el.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (el.hidden = true), ms)
}

/**
 * Pregunta con un diálogo del panel (no el confirm() del navegador). Devuelve una promesa:
 * true si se tocó `aceptar`. Esc o tocar afuera es cancelar. Con `cancelar: null` es un
 * aviso de un solo botón. `icono`: un ícono grande arriba (por ejemplo 'lock').
 */
function confirmar(texto, { titulo = '', aceptar = 'Aceptar', cancelar = 'Cancelar', icono = '' } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog')
    dlg.className = 'dlg confirmar-dlg'
    dlg.innerHTML = `${icono ? `<div class="confirmar-icono">${ic(icono)}</div>` : ''}${titulo ? `<h2>${esc(titulo)}</h2>` : ''}<p class="confirmar-texto">${esc(texto)}</p>
      <div class="btn-row">
        ${cancelar ? `<button type="button" class="btn ghost" data-r="no">${esc(cancelar)}</button>` : ''}
        <button type="button" class="btn primary" data-r="si" autofocus>${esc(aceptar)}</button>
      </div>`
    let respuesta = false
    dlg.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r
      // Un clic en el fondo cae sobre el propio <dialog>, pero fuera de su recuadro.
      const c = dlg.getBoundingClientRect()
      const afuera = e.target === dlg && (e.clientX < c.left || e.clientX > c.right || e.clientY < c.top || e.clientY > c.bottom)
      if (r || afuera) {
        respuesta = r === 'si'
        dlg.close()
      }
    })
    dlg.addEventListener('close', () => {
      dlg.remove()
      resolve(respuesta)
    })
    document.body.append(dlg)
    dlg.showModal()
  })
}

/* ---------------- Formato de WhatsApp ---------------- */

/**
 * *negrita*, _cursiva_, ~tachado~, ```monoespaciado```, links y menciones, sobre texto ya
 * escapado. `menciones` ({ "549...": "Nombre" }) cambia cada "@número" por "@Nombre".
 */
function formatear(texto, menciones = null) {
  const links = []
  let html = esc(texto)
  if (menciones) {
    html = html.replace(/@(\d{6,15})/g, (todo, digitos) => (menciones[digitos] ? `<b class="mencion">@${esc(menciones[digitos])}</b>` : todo))
  }
  html = html.replace(/\b(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?]|www\.[^\s<]+[^\s<.,:;"')\]!?])/gi, (url) => {
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
  { id: 'grupos', label: 'Grupos', test: (c) => c.esGrupo },
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
  const foto = c?.foto ? `<img src="${rutaApi(`/api/chats/${enc(c.id)}/foto?v=${c.foto}`)}" alt="" loading="lazy">` : ''
  return `<span class="avatar" data-jid="${esc(c?.id || '')}">${iniciales(c)}${foto}</span>`
}

function tickHtml(estado) {
  if (estado === 'leido' || estado === 'reproducido') return `<span class="tick read">${ic('checks')}</span>`
  if (estado === 'entregado') return `<span class="tick">${ic('checks')}</span>`
  if (estado === 'enviado') return `<span class="tick">${ic('check')}</span>`
  if (['pendiente', 'en_cola', 'enviando'].includes(estado)) return `<span class="tick">${ic('clock')}</span>`
  if (estado === 'error') return `<span class="tick err">${ic('alert')}</span>`
  return ''
}

/** "escribiendo…" y "grabando audio…" duran 25 s si WhatsApp no avisa que terminó. */
function actividadDe(chatId) {
  const p = state.presencias.get(chatId)
  if (!p || Date.now() - p.recibido > 25000) return null
  // En un grupo, con el nombre de quien escribe ("Seba está escribiendo…").
  const quien = p.quien ? `${p.quien} está ` : ''
  if (p.estado === 'composing') return `${quien}escribiendo…`
  if (p.estado === 'recording') return `${quien}grabando audio…`
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
  const ocupante = sesion.login ? ocupanteDe(c.id) : null
  const otros = otrosEnChat(c.id)
  const iconos = [
    // Sin login no hay bloqueo: solo se avisa quién más lo tiene abierto.
    !ocupante && otros.length ? `<span class="agente-tag" title="${esc(nombresLista(otros))} ${otros.length === 1 ? 'está' : 'están'} en este chat">${ic('user')}<span>${esc(nombresLista(otros))}</span></span>` : '',
    c.silenciado ? ic('mute') : '',
    c.fijado && !c.archivado ? ic('fijado') : '',
    c.noLeidos ? `<span class="unread tnum">${c.noLeidos}</span>` : '',
  ].join('')
  const clases = ['row', c.id === state.activo && 'active', c.noLeidos && 'has-unread', c.silenciado && 'silenciado', ocupante && 'ocupado'].filter(Boolean).join(' ')
  const titulo = ocupante ? ` title="${esc(ocupante.nombre)} está atendiendo este chat"` : ''
  return `<button class="${clases}" data-chat="${esc(c.id)}"${titulo}>
    ${ocupante ? `<span class="ocupado-cinta">${ic('lock')}<span>${esc(primerNombre(ocupante.nombre))}</span></span>` : ''}
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
    else if (state.filter === 'grupos') vacio = 'No hay grupos en la bandeja. Traelos con el botón de actualizar, arriba a la derecha.'
    else vacio = 'Todavía no hay chats. Cuando la línea reciba o envíe un mensaje, aparece acá.'
  }
  const res = resultadosHtml()
  // Con búsqueda activa, "sin chats" no es un vacío: los mensajes pueden coincidir igual.
  const cuerpo = filas.length ? filas.map(filaChat).join('') : q && res ? '' : `<div class="empty">${vacio}</div>`
  $('#chatList').innerHTML = filaArchivados + cuerpo + res

  // Para una bandeja de trabajo no se esconde nada: el total de la pestaña cuenta también
  // los chats silenciados (silenciar solo apaga los avisos), igual que el filtro "No leídos".
  const total = todos.filter((c) => !c.archivado).reduce((s, c) => s + (c.noLeidos || 0), 0)
  document.title = `${total ? `(${total}) ` : ''}WhatsApp Neifert`
}

/* ---------------- Conversación ---------------- */

// Lo último que se vio de cada chat en esta sesión: con el servidor caído, los chats se
// pueden seguir leyendo (solo lectura) con lo que ya estaba cargado.
const leidosEnSesion = new Map() // chatId → { mensajes, hayAnteriores }
const MAX_CHATS_GUARDADOS = 40
function guardarLeido(id) {
  if (!id || !state.mensajes.size) return
  leidosEnSesion.delete(id)
  leidosEnSesion.set(id, { mensajes: ordenados(), hayAnteriores: state.hayAnteriores })
  if (leidosEnSesion.size > MAX_CHATS_GUARDADOS) leidosEnSesion.delete(leidosEnSesion.keys().next().value)
}
// Sin servidor: se cortó la conexión con la PC ('servicio') o se lee de la base porque está apagada ('nube').
const sinServidor = () => state.conn.conexion === 'servicio' || state.conn.conexion === 'nube'

/* ---------------- Modo lectura (NUBE): precarga por tandas y caché del navegador ---------------- */

/*
 * Con la PC servidor apagada los mensajes salen de Supabase. Para no pedirle todo de golpe:
 *   - Se precargan en segundo plano, del chat más reciente al más viejo, de a 5 chats a la
 *     vez. Primero la tanda más nueva de cada chat; después las anteriores, también de la
 *     más nueva a la más vieja.
 *   - Todo lo que se trae queda en el navegador (IndexedDB: localStorage no alcanza para
 *     miles de mensajes). Al volver a entrar se muestra al instante y a la base solo se le
 *     piden los chats con mensajes nuevos, y de esos solo lo nuevo.
 * Con el servidor encendido nada de esto se usa: los mensajes salen del servidor.
 */
const SEGMENTO_NUBE = 100
const PARALELO_NUBE = 5

const cacheNube = (() => {
  let db = null
  const abrir = () =>
    (db ??= new Promise((resolve, reject) => {
      const r = indexedDB.open('nf-wa-lectura', 1)
      r.onupgradeneeded = () => {
        r.result.createObjectStore('lista')
        r.result.createObjectStore('chats')
      }
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    }))
  const pedir = async (almacen, modo, fn) => {
    const base = await abrir()
    return new Promise((resolve, reject) => {
      const tx = base.transaction(almacen, modo)
      const req = fn(tx.objectStore(almacen))
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => reject(tx.error)
    })
  }
  // Si el navegador no deja guardar (modo privado, sin espacio), se sigue sin caché.
  return {
    leer: (almacen, clave) => pedir(almacen, 'readonly', (s) => s.get(clave)).catch(() => null),
    guardar: (almacen, clave, valor) => pedir(almacen, 'readwrite', (s) => s.put(valor, clave)).catch(() => {}),
  }
})()

// Todo va separado por número de línea: la base puede tener chats de más de una.
const lineaNube = () => String(state.conn.yo?.telefono || leerLocal('nf-wa-lectura-linea', '') || '').replace(/\D/g, '')
const claveNube = (chatId) => `${lineaNube()}|${chatId}`
const unirMensajes = (a, b) => {
  const porId = new Map(a.map((m) => [m.id, m]))
  for (const m of b) porId.set(m.id, m)
  return [...porId.values()].sort((x, y) => x.ts - y.ts || (x.id < y.id ? -1 : 1))
}

const pidiendoNube = new Map() // chatId → promesa: dos pedidos del mismo chat esperan el mismo
function deUnaVez(llave, fn) {
  if (!pidiendoNube.has(llave)) pidiendoNube.set(llave, fn().finally(() => pidiendoNube.delete(llave)))
  return pidiendoNube.get(llave)
}

/**
 * Lo guardado de un chat, al día: si no hay nada, la tanda más nueva; si hay pero el chat
 * tuvo mensajes después, solo lo nuevo. Devuelve { mensajes, completo, vistoTs }.
 */
function alDiaNube(chatId) {
  return deUnaVez(`nuevo|${chatId}`, async () => {
    const clave = claveNube(chatId)
    const ultimoTs = state.chats.get(chatId)?.ultimoTs || 0
    let e = await cacheNube.leer('chats', clave)
    if (!e) {
      const r = await api(`/api/chats/${enc(chatId)}/mensajes?limite=${SEGMENTO_NUBE}`)
      e = { mensajes: r.mensajes, completo: !r.hayAnteriores, vistoTs: ultimoTs }
    } else if (ultimoTs > (e.vistoTs || 0)) {
      let desde = e.mensajes.at(-1)?.ts || 0
      try {
        for (;;) {
          const r = await api(`/api/chats/${enc(chatId)}/mensajes?despuesTs=${desde}&limite=${SEGMENTO_NUBE}`)
          e.mensajes = unirMensajes(e.mensajes, r.mensajes)
          if (!r.hayPosteriores || !r.mensajes.length) break
          desde = r.mensajes.at(-1).ts
        }
      } catch {
        // Sin conexión con la base: se muestra lo guardado y lo nuevo se pide la próxima vez.
        return e
      }
      e.vistoTs = ultimoTs
    } else {
      return e
    }
    await cacheNube.guardar('chats', clave, e)
    return e
  })
}

/** Una tanda más vieja de un chat (si quedan), guardada junto con lo demás. */
function anterioresNube(chatId) {
  return deUnaVez(`viejo|${chatId}`, async () => {
    const clave = claveNube(chatId)
    const e = (await cacheNube.leer('chats', clave)) || (await alDiaNube(chatId))
    if (!e || e.completo || !e.mensajes.length) return e
    const r = await api(`/api/chats/${enc(chatId)}/mensajes?antes=${enc(e.mensajes[0].id)}&limite=${SEGMENTO_NUBE}`)
    e.mensajes = unirMensajes(r.mensajes, e.mensajes)
    e.completo = !r.hayAnteriores || !r.mensajes.length
    await cacheNube.guardar('chats', clave, e)
    return e
  })
}

/** Si el chat que se está leyendo recibió mensajes de la precarga, se suman sin mover la vista. */
function sumarAlAbierto(chatId, e) {
  if (!e || state.activo !== chatId) return
  const antes = state.mensajes.size
  for (const m of e.mensajes) state.mensajes.set(m.id, m)
  state.hayAnteriores = !e.completo
  if (state.mensajes.size !== antes) renderMensajes({ mantenerPosicion: true })
}

/** Corre `fn` sobre cada elemento, de a `n` a la vez y en orden. */
async function deANa(items, n, fn) {
  let i = 0
  const trabajador = async () => {
    while (i < items.length) {
      const item = items[i++]
      try {
        await fn(item)
      } catch {
        // Un chat que falla no frena a los demás: se reintenta la próxima vez que se entre.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, trabajador))
}

let precargandoNube = false
async function precargarNube() {
  if (!NUBE || precargandoNube) return
  precargandoNube = true
  try {
    const orden = [...state.chats.values()].sort((a, b) => (b.ultimoTs || 0) - (a.ultimoTs || 0)).map((c) => c.id)
    // 1) La tanda más nueva de cada chat (o lo nuevo, si ya estaba guardado).
    await deANa(orden, PARALELO_NUBE, async (id) => sumarAlAbierto(id, await alDiaNube(id)))
    // 2) Las tandas anteriores, de la más nueva a la más vieja, hasta completar cada chat.
    let quedan = orden
    while (quedan.length) {
      const siguen = new Set()
      await deANa(quedan, PARALELO_NUBE, async (id) => {
        const e = await anterioresNube(id)
        sumarAlAbierto(id, e)
        if (e && !e.completo) siguen.add(id)
      })
      quedan = orden.filter((id) => siguen.has(id))
    }
  } finally {
    precargandoNube = false
  }
}

/**
 * Arranque en modo lectura: si ya se había entrado, la lista guardada se muestra al
 * instante; después se trae la lista actual (un solo pedido) y arranca la precarga.
 */
async function arrancarNube() {
  const guardada = await cacheNube.leer('lista', lineaNube())
  if (guardada?.chats?.length && !state.chats.size) {
    state.chats = new Map(guardada.chats.map((c) => [c.id, c]))
    onEstado(guardada.estado)
    renderList()
    terminarArranque()
  }
  await sincronizar()
  if (state.chats.size && state.conn.yo?.telefono) {
    guardarLocal('nf-wa-lectura-linea', lineaNube())
    cacheNube.guardar('lista', lineaNube(), { chats: [...state.chats.values()], estado: state.conn, ts: Date.now() })
    precargarNube()
  }
}

async function abrirChat(id) {
  const chat = state.chats.get(id)
  // Si otra persona lo está atendiendo, no se entra (ver entrarAlChat). Sin servidor no se
  // puede preguntar: se entra a leer, y escribir queda bloqueado igual.
  if (state.activo !== id && !sinServidor() && !(await entrarAlChat(id))) return
  if (state.activo && state.activo !== id) guardarLeido(state.activo)
  state.activo = id
  state.mensajes = new Map()
  state.citados = new Map()
  state.hayAnteriores = false
  state.recorte = 0
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
  // En un grupo, debajo del nombre van los integrantes (como en WhatsApp).
  // Sin servidor no hay integrantes ni "en línea" para pedir: solo se leen los mensajes.
  if (chat?.esGrupo && !sinServidor()) cargarIntegrantes(id).then(() => state.activo === id && renderHead())
  $('#msgList').innerHTML = '<div class="sys">Cargando mensajes…</div>'
  if (!sinServidor()) {
    api(`/api/chats/${enc(id)}/presencia`, { method: 'POST' })
      .then((p) => p && state.activo === id && onPresencia({ chatId: id, ...p }))
      .catch(() => {})
  }
  let pagina
  let guardado = false
  try {
    // Solo la última página: lo anterior se pide al subir (cargarAnteriores). En modo
    // lectura, de lo guardado en el navegador (y de la base solo lo que falte).
    if (NUBE) {
      const e = await alDiaNube(id)
      pagina = { mensajes: e.mensajes, hayAnteriores: !e.completo }
    } else {
      pagina = await api(`/api/chats/${enc(id)}/mensajes?limite=${PAGINA_SERVIDOR}`)
    }
  } catch (err) {
    // El servidor no contesta: si el chat ya se había abierto en esta sesión, se lee eso.
    pagina = leidosEnSesion.get(id)
    guardado = true
    if (!pagina) {
      if (state.activo === id) {
        // En modo lectura (nube) los mensajes vienen de la base: si fallan, se dice por qué.
        $('#msgList').innerHTML = sinServidor() && !NUBE
          ? '<div class="sys">El servidor no responde y este chat no se abrió antes en esta sesión: sus mensajes se ven cuando vuelva.</div>'
          : `<div class="sys">No se pudieron cargar los mensajes: ${esc(err.message)}</div>`
      }
      return
    }
  }
  if (state.activo !== id) return
  for (const m of pagina.mensajes) state.mensajes.set(m.id, m)
  state.hayAnteriores = guardado ? false : pagina.hayAnteriores
  prepararSinLeer()
  renderMensajes()
  if (guardado) $('#msgList').insertAdjacentHTML('afterbegin', '<div class="aviso-lectura">Solo lectura: son los mensajes que ya estaban cargados. Lo nuevo aparece cuando vuelva el servidor.</div>')
  else if (!sinServidor()) marcarLeido(id)
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
  state.visibles = Math.min(MAX_DIBUJADOS, Math.max(PAGINA, todos.length - indice + 10))
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

// Características de 2 y 3 cifras de Argentina; el resto son de 4 (como 3564).
const CARACTERISTICAS_AR = new Set(['11', '220', '221', '223', '230', '236', '237', '249', '260', '261', '263', '264', '266', '280', '291', '294', '297', '298', '299', '336', '341', '342', '343', '345', '348', '351', '353', '358', '362', '364', '370', '376', '379', '380', '381', '383', '385', '387', '388'])

/** "+5493564361422" → "+54 9 3564 36-1422", como lo muestra WhatsApp. Otros países, tal cual. */
function telefonoLegible(tel) {
  const m = /^\+?549(\d{10})$/.exec(String(tel || '').replace(/\s/g, ''))
  if (!m) return tel || ''
  const n = m[1]
  const largo = CARACTERISTICAS_AR.has(n.slice(0, 2)) ? 2 : CARACTERISTICAS_AR.has(n.slice(0, 3)) ? 3 : 4
  const area = n.slice(0, largo)
  const resto = n.slice(largo)
  return `+54 9 ${area} ${resto.slice(0, -4)}-${resto.slice(-4)}`
}

/**
 * "Alejo, Nico, Vale, +54 9 3564 36-1422, Tú": primero los que tienen nombre (por orden
 * alfabético), después los números y al final la línea.
 */
function nombresIntegrantes(lista) {
  if (!lista?.length) return ''
  const conNombre = []
  const numeros = []
  for (const p of lista) {
    const sinNombre = !p.nombre || p.nombre === p.telefono || /^\+?\d[\d\s-]*$/.test(p.nombre)
    if (sinNombre) numeros.push(telefonoLegible(p.telefono || p.nombre || p.jid.split('@')[0]))
    else conNombre.push(p.nombre)
  }
  conNombre.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  return [...conNombre, ...numeros, 'Tú'].join(', ')
}

function subtituloChat(c) {
  const actividad = actividadDe(c.id)
  if (actividad) return `<span class="estado-escribiendo">${actividad}</span>`
  const p = state.presencias.get(c.id)
  if (p && ['available', 'composing', 'recording', 'paused'].includes(p.estado)) return '<span class="estado-en-linea">en línea</span>'
  if (p?.visto) return `<span class="tnum">últ. vez ${diaDe(p.visto).toLowerCase()} a las ${hora(p.visto)}</span>`
  if (c.esGrupo) {
    const nombres = integrantesChat.chat === c.id ? nombresIntegrantes(integrantesChat.lista) : ''
    if (nombres) return `<span class="integrantes" title="${esc(nombres)}">${esc(nombres)}</span>`
    return `<span class="tnum">${esc(c.grupoNombre ? 'Grupo' : 'Grupo · WhatsApp todavía no mandó el nombre')}</span>`
  }
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
    ${sinServidor() ? `<span class="tag solo-lectura-tag" title="El servidor no responde: se puede leer, pero no escribir ni cambiar nada">${ic('clock')} Solo lectura</span>` : ''}
    ${sinServidor() ? '' : sesion.login
      ? `<span class="tag atendiendo" title="Mientras lo tengas abierto, nadie más puede entrar a este chat">${ic('lock')} Lo atendés vos</span>`
      : otrosEnChat(c.id).length ? `<span class="tag equipo" title="Tiene este chat abierto ahora">${ic('user')} ${esc(nombresLista(otrosEnChat(c.id)))} ${otrosEnChat(c.id).length === 1 ? 'está' : 'están'} acá</span>` : ''}
    ${c.silenciado ? `<span class="tag">${ic('mute')} Silenciado</span>` : ''}
    ${c.archivado ? `<span class="tag">${ic('archive')} Archivado</span>` : ''}`
}

const ordenados = () => [...state.mensajes.values()].sort((a, b) => a.ts - b.ts)
const esAudio = (m) => m.tipo === 'nota_voz' || m.tipo === 'audio'
const urlMedia = (m) => rutaApi(`/api/chats/${enc(state.activo)}/media/${enc(m.id)}?e=${m.media?.estado || ''}`)
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

/**
 * Mensajes dibujados: una ventana de como mucho MAX_DIBUJADOS. `state.visibles` es su
 * tamaño y `state.recorte` cuántos de los más nuevos quedan afuera por abajo (al subir
 * mucho). Así la pantalla nunca tiene miles de burbujas, aunque el chat sí.
 */
function ventanaDibujada() {
  const todos = ordenados()
  const hasta = Math.max(0, todos.length - (state.recorte || 0))
  const desde = Math.max(0, hasta - state.visibles)
  return { todos, desde, hasta }
}

/** El primer mensaje que se ve y a qué altura: para no mover la vista al redibujar. */
function anclaDeVista() {
  const box = $('#messages')
  for (const el of $('#msgList').children) {
    if (el.dataset.id && el.offsetTop + el.offsetHeight > box.scrollTop) return { id: el.dataset.id, delta: el.offsetTop - box.scrollTop }
  }
  return null
}

function renderMensajes({ mantenerPosicion = false } = {}) {
  const box = $('#messages')
  const lista = $('#msgList')
  const { todos, desde, hasta } = ventanaDibujada()
  const visibles = todos.slice(desde, hasta)
  const ancla = mantenerPosicion ? anclaDeVista() : null
  const distanciaAlFinal = box.scrollHeight - box.scrollTop

  const partes = []
  if (desde > 0 || state.hayAnteriores) partes.push('<div class="mas-antiguos">Subí para ver mensajes anteriores</div>')
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
  if (hasta < todos.length) {
    partes.push(`<button class="mas-recientes" data-act="bajar">${ic('down')}Ver los mensajes más recientes</button>`)
  }
  lista.innerHTML = partes.length ? partes.join('') : `<div class="sys" data-vacio>${vacioHtml()}</div>`
  visibles.filter(esAudio).forEach((m) => actualizarVoz(m.id))
  cargarCitadosFaltantes(visibles)

  const separador = lista.querySelector('.sin-leer')
  if (mantenerPosicion) {
    // Se deja quieto el mensaje que se estaba mirando (sirve tanto si se agregaron
    // mensajes arriba como si se sacaron de abajo por el techo de la pantalla).
    const el = ancla && document.getElementById(domId(ancla.id))
    box.scrollTop = el ? el.offsetTop - ancla.delta : box.scrollHeight - distanciaAlFinal
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

/**
 * Trae del servidor la página de mensajes anterior a la más vieja que hay cargada.
 * Devuelve true si llegó algo.
 */
async function cargarAnteriores() {
  const chat = state.activo
  const masViejo = ordenados()[0]
  if (!chat || !state.hayAnteriores || !masViejo) return false
  if (NUBE) {
    // Modo lectura: una tanda más vieja, que queda guardada en el navegador.
    const e = await anterioresNube(chat).catch(() => null)
    if (!e || state.activo !== chat) return false
    const antes = state.mensajes.size
    for (const m of e.mensajes) state.mensajes.set(m.id, m)
    state.hayAnteriores = !e.completo
    return state.mensajes.size > antes
  }
  const r = await api(`/api/chats/${enc(chat)}/mensajes?antes=${enc(masViejo.id)}&limite=${PAGINA_SERVIDOR}`).catch(() => null)
  if (!r || state.activo !== chat) return false
  for (const m of r.mensajes) state.mensajes.set(m.id, m)
  state.hayAnteriores = r.hayAnteriores
  return r.mensajes.length > 0
}

/** Vuelve a los mensajes más nuevos (con techo: se dibuja la última tanda, no todo). */
function irAlFinal() {
  if (state.recorte) {
    state.recorte = 0
    state.visibles = PAGINA
    renderMensajes()
  }
  irAbajo()
}

let cargandoAnteriores = false
$('#messages').addEventListener('scroll', () => {
  const box = $('#messages')
  cerrarMenu()
  state.pegadoAbajo = !state.recorte && box.scrollHeight - box.scrollTop - box.clientHeight < 80
  if (state.pegadoAbajo) state.nuevosAbajo = 0
  actualizarBajar()
  if (cargandoAnteriores) return
  const { desde } = ventanaDibujada()
  if (box.scrollTop < 200 && (desde > 0 || state.hayAnteriores)) {
    // Arriba: se agregan mensajes anteriores. Si ya hay MAX_DIBUJADOS en pantalla, se
    // sacan los más nuevos de abajo (la ventana se corre). Si no quedan más cargados,
    // se pide la página anterior al servidor.
    cargandoAnteriores = true
    ;(async () => {
      if (desde === 0) await cargarAnteriores()
      if (state.visibles + PAGINA > MAX_DIBUJADOS) state.recorte = (state.recorte || 0) + PAGINA
      else state.visibles += PAGINA
      renderMensajes({ mantenerPosicion: true })
      cargandoAnteriores = false
    })()
  } else if (state.recorte && box.scrollHeight - box.scrollTop - box.clientHeight < 200) {
    // Abajo, con mensajes nuevos fuera de la pantalla: la ventana se corre hacia abajo.
    cargandoAnteriores = true
    requestAnimationFrame(() => {
      state.recorte = Math.max(0, state.recorte - PAGINA)
      renderMensajes({ mantenerPosicion: true })
      cargandoAnteriores = false
    })
  }
}, { passive: true })

/** Respuestas a mensajes que no están en la página cargada: se traen sueltos. */
const citadosPedidos = new Set()
function cargarCitadosFaltantes(visibles) {
  const chat = state.activo
  for (const m of visibles) {
    if (!m.citado || state.mensajes.has(m.citado) || state.citados.has(m.citado) || citadosPedidos.has(`${chat}|${m.citado}`)) continue
    citadosPedidos.add(`${chat}|${m.citado}`)
    api(`/api/chats/${enc(chat)}/mensajes/${enc(m.citado)}`)
      .then((q) => {
        state.citados.set(q.id, q)
        if (state.activo !== chat) return
        // Se redibujan las burbujas que lo citan, ahora con el original.
        for (const v of state.mensajes.values()) {
          if (v.citado !== q.id) continue
          const el = document.getElementById(domId(v.id))
          if (el) el.outerHTML = msgHtml(v, el.classList.contains('cola'))
        }
      })
      .catch(() => {})
  }
}

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
    state.visibles = Math.min(MAX_DIBUJADOS, state.visibles + 1)
    renderMensajes({ mantenerPosicion: !state.pegadoAbajo })
    return
  }

  if (state.recorte) {
    // Se está leyendo más arriba (los más nuevos están fuera de la pantalla): no se dibuja,
    // se cuenta en el botón de bajar.
    state.recorte++
    if (mensaje.deMi) irAlFinal()
    else {
      state.nuevosAbajo++
      actualizarBajar()
    }
    return
  }

  state.visibles++
  if (state.visibles > MAX_DIBUJADOS) {
    // Techo de la pantalla: sale el más viejo dibujado.
    state.visibles = MAX_DIBUJADOS
    const primero = $('#msgList').querySelector('.msg, .sys.aviso-grupo')
    primero?.remove()
  }
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
    case 'en_cola': return `<span title="En la bandeja de salida: se manda cuando vuelva la conexión">${ic('clock')}</span>`
    case 'enviando': return `<span title="Enviando">${ic('clock')}</span>`
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
  // Los que quedaron "grandes" con un límite anterior (64 MB) ahora se pueden bajar a mano.
  if (md.estado === 'grande' && (md.tamano || 0) > limiteMb() * 1024 * 1024) {
    return `<div class="media-missing">${ic('alert')}<span class="mm-txt"><b>${esc(nombre)}</b><small>${fmtBytes(md.tamano)}: supera el límite de descarga (${textoMb(limiteMb())}).</small></span></div>`
  }
  if (md.estado === 'descargando') {
    return `<div class="media-missing"><span class="spinner" aria-hidden="true"></span><span class="mm-txt"><b>${esc(nombre)}</b><small>Descargando…</small></span></div>`
  }
  if (md.estado === 'liberado') {
    // Se borró para no pasar el tope de espacio de R2 (el plan gratuito). Se puede pedir de nuevo.
    return `<div class="media-missing">${ic('archive')}<span class="mm-txt"><b>${esc(nombre)}</b><small>Archivo borrado para liberar espacio.</small></span><button class="btn ghost mm-btn" data-descargar="${esc(m.id)}">Bajar de nuevo</button></div>`
  }
  const error = md.estado === 'error'
  const detalle = [esAudio(m) && md.segundos ? fmtDur(md.segundos) : null, md.tamano ? fmtBytes(md.tamano) : null].filter(Boolean).join(' · ')
  return `<div class="media-missing ${error ? 'is-error' : ''}">
    ${ic(error ? 'alert' : ICONO_MEDIA[m.tipo] || 'file')}
    <span class="mm-txt"><b>${esc(nombre)}</b>${detalle ? `<small class="tnum">${detalle}</small>` : ''}${error ? `<small class="mm-err">${esc(md.error || 'No se pudo descargar.')}</small>` : md.vencido ? '<small>Se le pide al celular de la línea.</small>' : ''}</span>
    <button class="btn ghost mm-btn" data-descargar="${esc(m.id)}">${error ? 'Reintentar' : 'Descargar'}</button>
  </div>`
}

function mediaHtml(m) {
  const md = m.media
  if (!md) return ''
  if (md.estado !== 'ok') return mediaPendienteHtml(m)
  const url = urlMedia(m)
  // Con miniatura (480 px), la lista muestra esa y el archivo completo baja solo al abrirlo.
  const mini = md.miniatura ? rutaApi(`/api/chats/${enc(state.activo)}/media/${enc(m.id)}/miniatura`) : null
  switch (m.tipo) {
    case 'imagen': return `<button class="media-img" data-ver="${url}" aria-label="Ampliar foto"><img src="${mini || url}" alt="Foto" loading="lazy"></button>`
    case 'sticker': return `<img class="sticker" src="${url}" alt="Sticker" loading="lazy">`
    case 'video': return `<video class="media-video" src="${url}" controls preload="${mini ? 'none' : 'metadata'}"${mini ? ` poster="${mini}"` : ''}></video>`
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
  // Aviso de grupo ("Seba agregó a Juli"): una línea centrada, como en WhatsApp.
  if (m.tipo === 'sistema') return `<div class="sys aviso-grupo" id="${domId(m.id)}" data-id="${esc(m.id)}">${esc(m.texto)}</div>`
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
    const q = state.mensajes.get(m.citado) || state.citados.get(m.citado)
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
      texto = `<div class="txt ${grande ? 'emoji-grande' : ''}">${['otro', 'sistema'].includes(m.tipo) ? `<i>${esc(m.texto)}</i>` : formatear(m.texto, m.menciones)}</div>`
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
  // Reacciones por persona (en un grupo pueden reaccionar varios): cada emoji una vez,
  // con cuántos y quiénes al pasar el mouse.
  const reacciones = m.reacciones ? Object.entries(m.reacciones).filter(([, e]) => e) : []
  const porEmoji = new Map()
  for (const [quien, emoji] of reacciones) porEmoji.set(emoji, [...(porEmoji.get(emoji) || []), nombreQuienReacciono(quien, m)])
  const reacts = porEmoji.size
    ? `<div class="reacts" aria-label="Reacciones">${[...porEmoji].map(([emoji, quienes]) => `<span title="${esc(quienes.join(', '))}">${esc(emoji)}${quienes.length > 1 ? `<small class="tnum">${quienes.length}</small>` : ''}</span>`).join('')}</div>`
    : ''
  // Bandeja de salida: el mensaje todavía no salió.
  const salida = m.salida && ['en_cola', 'enviando', 'error'].includes(m.estado)
    ? `<div class="salida-nota ${m.estado === 'error' ? 'is-error' : ''}">${ic(m.estado === 'error' ? 'alert' : 'clock')}<span>${
        m.estado === 'enviando' ? 'Enviando…' : m.estado === 'error' ? `No se pudo mandar: ${esc(m.salida.error || 'error')}` : 'En cola: se manda solo cuando vuelva la conexión'
      }</span>${m.estado !== 'enviando' && puede.escribir()
        ? `${m.estado === 'error' ? `<button class="link-btn" data-salida-act="reintentar" data-id="${esc(m.id)}">Reintentar</button>` : ''}<button class="link-btn" data-salida-act="descartar" data-id="${esc(m.id)}">Descartar</button>`
        : ''}</div>`
    : ''
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
  return `<div class="${clases}" id="${domId(m.id)}" data-id="${esc(m.id)}" data-autor="${esc(firmanteDe(m))}">${opciones}${nombreAutor}${eliminado}${cuerpo}${texto}${ediciones}${salida}${meta}${reacts}</div>`
}

/** Nombre de quien reaccionó: 'yo' es la línea; 'contacto', el del chat; si no, un integrante. */
function nombreQuienReacciono(quien, m) {
  if (quien === 'yo') return 'Vos'
  if (quien === 'contacto') return state.chats.get(state.activo)?.nombre || 'Contacto'
  return m?.reactores?.[quien] || state.nombresIntegrantes?.get(quien) || `+${String(quien).split('@')[0]}`
}

/** Lleva al mensaje citado: si todavía no está dibujado, agranda la tanda hasta incluirlo. */
async function irAMensaje(id) {
  // Si es más viejo que lo cargado, se piden páginas hacia atrás hasta encontrarlo.
  const chat = state.activo
  while (!state.mensajes.has(id) && state.hayAnteriores) {
    if (!(await cargarAnteriores()) || state.activo !== chat) break
  }
  if (!state.mensajes.has(id)) return toast('Ese mensaje no está guardado en el respaldo.')
  let el = document.getElementById(domId(id))
  if (!el) {
    // Se dibuja una ventana alrededor del mensaje (respetando el techo de la pantalla).
    const todos = ordenados()
    const i = todos.findIndex((m) => m.id === id)
    // 20 mensajes de contexto antes y después del buscado.
    const hasta = Math.min(todos.length, i + 20)
    state.recorte = todos.length - hasta
    state.visibles = Math.min(MAX_DIBUJADOS, hasta - Math.max(0, i - 20))
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
  if (accion === 'eliminar') {
    const titulo = ids.length === 1 ? '¿Eliminar este mensaje para todos?' : `¿Eliminar estos ${ids.length} mensajes para todos?`
    if (!(await confirmar('Desaparece del chat del contacto. Acá queda guardado el original.', { titulo, aceptar: 'Eliminar' }))) return
  }
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

// Desde qué sitios puede hablarle el CRM al panel (lo informa el servidor).
const origenesCrm = EMBEBIDO
  ? fetch('/api/publico').then((r) => r.json()).then((d) => d.origenesCrm || []).catch(() => [])
  : Promise.resolve([])
const delCrm = async (e) => e.source === window.parent && (await origenesCrm).some((p) => coincideOrigen(e.origin, p))

// Embebido, el encabezado (pestañas, estado de la línea y actualizar) lo dibuja el CRM:
// el CRM le pasa su tema y lo que se toca arriba; el panel le avisa cómo está la línea.
window.addEventListener('message', async (e) => {
  if (e.source !== window.parent) return
  const { tipo } = e.data || {}
  if (tipo === 'nf-wa:tema') {
    if (e.data.tema !== 'dark' && e.data.tema !== 'light') return
    document.documentElement.dataset.theme = e.data.tema
    syncTema()
  } else if (tipo === 'nf-wa:vista' && (await delCrm(e))) {
    if (e.data.vista === 'inbox' || e.data.vista === 'connect') setView(e.data.vista)
  } else if (tipo === 'nf-wa:actualizar' && (await delCrm(e))) {
    actualizarTodo()
  }
})

/** 'http://localhost:*' → acepta cualquier puerto de localhost. */
const coincideOrigen = (origen, patron) =>
  new RegExp('^' + patron.replace(/[.+?^$(){}|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$').test(origen)

/**
 * Le pide al CRM (la página que contiene al panel) la sesión de su usuario. El token
 * viaja por mensaje entre ventanas y solo se acepta si viene del CRM: nunca pasa por la
 * dirección, el historial ni los registros de ningún servidor.
 */
async function tokenDelCrm() {
  if (!EMBEBIDO) return null
  const permitidos = await origenesCrm
  return new Promise((resolve) => {
    const fin = (token) => {
      clearTimeout(timer)
      window.removeEventListener('message', alMensaje)
      resolve(token)
    }
    const alMensaje = (e) => {
      if (e.source !== window.parent || e.data?.tipo !== 'nf-wa:token') return
      if (!permitidos.some((p) => coincideOrigen(e.origin, p))) return
      fin(typeof e.data.token === 'string' ? e.data.token : null)
    }
    const timer = setTimeout(() => fin(null), 10000)
    window.addEventListener('message', alMensaje)
    avisarAlCrm({ tipo: 'nf-wa:pedir-token' })
  })
}

async function canjearToken(token) {
  return fetch('/api/sesion', {
    method: 'POST',
    headers: { ...CABECERA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}

/**
 * Entra al panel: si ya hay sesión abierta la usa; si no, embebido en el CRM pide la del
 * usuario del CRM y la canjea por la cookie del panel.
 */
async function entrar() {
  let res = null
  // Dentro del CRM se entra SIEMPRE con el usuario que está logueado ahí, aunque quede una
  // sesión anterior en este navegador: si alguien cambió de usuario en el CRM (de Bruno a
  // Admin, por ejemplo), el panel tiene que ser el del usuario nuevo, con sus permisos.
  if (EMBEBIDO) {
    const token = await tokenDelCrm()
    if (token) res = await canjearToken(token)
  }
  // Sin respuesta del CRM (o fuera del CRM): la sesión que haya en este navegador.
  if (!res) res = await fetch('/api/sesion')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    pantallaSinSesion(data, res.status)
    return false
  }
  sesion.usuario = data.usuario || null
  sesion.login = !!data.login
  renderYo()
  aplicarPermisos()
  avisarAlCrm({ tipo: 'nf-wa:listo' })
  renderPill()
  return true
}

/** Lo que el usuario puede hacer, según su rol en el CRM (sin login, en esta PC, todo). */
const puede = {
  escribir: () => !sesion.login || !!sesion.usuario?.escribir,
  linea: () => !sesion.login || !!sesion.usuario?.linea,
}

/** Esconde lo que el usuario no puede usar: el que entra solo a mirar no ve dónde escribir. */
function aplicarPermisos() {
  document.documentElement.classList.toggle('solo-lectura', !puede.escribir())
  document.documentElement.classList.toggle('sin-linea', !puede.linea())
}

let renovando = false
/**
 * Tapa el panel y explica cómo entrar. Embebido en el CRM, si la sesión venció (401)
 * primero se intenta renovarla en silencio con la sesión del CRM.
 */
async function pantallaSinSesion(data = {}, status = 0) {
  if (status === 401 && EMBEBIDO && !renovando) {
    renovando = true
    const token = await tokenDelCrm()
    if (token && (await canjearToken(token)).ok) return location.reload()
  }
  const pane = $('#sinSesion')
  $('#sinSesionTxt').textContent = data.error || 'Entrá al WhatsApp desde el CRM.'
  const link = $('#sinSesionLink')
  link.hidden = !data.crmUrl || EMBEBIDO
  if (data.crmUrl) link.href = data.crmUrl
  pane.hidden = false
  avisarAlCrm({ tipo: 'nf-wa:sin-sesion' })
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

/* ---------------- Un chat, una persona ---------------- */

/** Quién (otro) está atendiendo ese chat, o null. */
const ocupanteDe = (chatId) => otrosEnChat(chatId)[0] || null
const primerNombre = (nombre) => String(nombre || '').split(' ')[0] || 'Otra persona'

/**
 * Pide entrar a un chat. Cada chat lo atiende una sola persona a la vez: si otra lo tiene
 * abierto, no se entra y se avisa quién (un administrador lo puede tomar). Sin login (en
 * la PC servidor) no hay bloqueo.
 */
async function entrarAlChat(id, { forzar = false } = {}) {
  if (!sesion.login) return true
  try {
    await api('/api/viendo', { method: 'POST', json: { pestana: PESTANA, chatId: id, forzar } })
    return true
  } catch (err) {
    // Un corte no tiene que impedir abrir el chat: el bloqueo lo vuelve a controlar el servidor al escribir.
    if (err.status !== 409) return true
    return avisarOcupado(id, err.data?.ocupado)
  }
}

async function avisarOcupado(id, persona) {
  const nombre = persona?.nombre || 'Otra persona'
  const titulo = `${nombre} está atendiendo este chat`
  const texto = `Para no pisarse, cada chat lo atiende una sola persona a la vez. Se libera cuando ${primerNombre(nombre)} lo cierre o deje de usar el panel unos minutos.`
  if (!puede.linea()) {
    await confirmar(texto, { titulo, aceptar: 'Entendido', cancelar: null, icono: 'lock' })
    return false
  }
  const tomar = await confirmar(`${texto}\n\nComo administrador podés tomarlo: a ${primerNombre(nombre)} se le cierra el chat.`, {
    titulo,
    aceptar: 'Tomar el chat',
    cancelar: 'Dejarlo',
    icono: 'lock',
  })
  return tomar ? entrarAlChat(id, { forzar: true }) : false
}

/** Otra persona (un administrador) tomó el chat que tenía abierto: se cierra y se avisa. */
function echadoDelChat(persona) {
  if (!state.activo) return
  cerrarChat()
  const nombre = persona?.nombre || 'Otra persona'
  confirmar(`Ahora lo atiende ${primerNombre(nombre)}. Lo vas a poder abrir de nuevo cuando lo libere.`, {
    titulo: `${nombre} tomó este chat`,
    aceptar: 'Entendido',
    cancelar: null,
    icono: 'lock',
  })
}

// Mientras alguien usa el panel, cada minuto se avisa que sigue en el chat; si no avisa
// (se fue y lo dejó abierto), el servidor lo libera a los 3 minutos. Sin tocar nada en 10
// minutos se deja de avisar. Al volver, se avisa enseguida.
let ultimaActividad = Date.now()
const QUIETO_MS = 10 * 60_000
async function seguirEnChat() {
  const id = state.activo
  if (!id || !sesion.login || document.visibilityState !== 'visible' || Date.now() - ultimaActividad > QUIETO_MS) return
  try {
    await api('/api/viendo', { method: 'POST', json: { pestana: PESTANA, chatId: id } })
  } catch (err) {
    if (err.status === 409 && state.activo === id) echadoDelChat(err.data?.ocupado)
  }
}
for (const evento of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
  document.addEventListener(evento, () => {
    const volvio = Date.now() - ultimaActividad > 2 * 60_000
    ultimaActividad = Date.now()
    if (volvio) seguirEnChat()
  }, { passive: true, capture: true })
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && seguirEnChat())
setInterval(seguirEnChat, 60_000)

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

/**
 * Pide los mensajes que coinciden, de a 80. Con `mas`, la página siguiente se suma a la que
 * ya se ve ("Ver más resultados"). Se descartan las respuestas viejas que llegan tarde.
 */
async function buscarEnMensajes({ mas = false } = {}) {
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
    if (mas) params.set('desde', String(busqueda.resultados.length))
    const r = await api(`/api/buscar?${params}`)
    if (mio !== busqueda.pedido) return
    busqueda.resultados = mas ? [...busqueda.resultados, ...r.resultados] : r.resultados
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
    ? `<button class="res-mas" data-act="buscar-mas" ${busqueda.cargando ? 'disabled' : ''}>Ver más resultados <span class="tnum">(${fmtNum(busqueda.resultados.length)} de ${fmtNum(busqueda.total)})</span></button>`
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
  if (state.activo === chatId) irAMensaje(msgId)
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
  if (info.vista === 'ficha' && $('#crmBloque')) cargarCrm(f.id)
}

/* ---------------- Cliente del CRM (en la ficha del contacto) ---------------- */

const crmUi = { chat: null, ficha: null, form: null, resultados: [], usuarios: null }
const ESTADOS_CLIENTE = { activo: 'Activo', en_seguimiento: 'En seguimiento', vendido: 'Vendido', perdido: 'Perdido' }
const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function cargarCrm(chat) {
  if (crmUi.chat !== chat) Object.assign(crmUi, { chat, ficha: null, form: null, resultados: [] })
  try {
    const ficha = await api(`/api/chats/${enc(chat)}/crm`)
    if (crmUi.chat !== chat) return
    crmUi.ficha = ficha
  } catch (err) {
    crmUi.ficha = { error: err.message }
  }
  renderCrm()
}

function renderCrm() {
  const el = $('#crmBloque')
  const f = crmUi.ficha
  if (!el || !f || info.ficha?.id !== crmUi.chat) return
  const partes = ['<h4>Cliente del CRM</h4>']
  if (f.error) {
    partes.push(`<p class="info-vacio">No se pudo consultar el CRM: ${esc(f.error)}</p>`)
  } else if (f.cliente) {
    const c = f.cliente
    partes.push(`<div class="crm-cliente">
      <div><b>${esc(c.nombre)}</b><span class="crm-estado est-${esc(c.status)}">${esc(ESTADOS_CLIENTE[c.status] || c.status)}</span>${c.archivado ? '<span class="crm-estado">Archivado</span>' : ''}</div>
      <p class="info-sub">${esc([c.telefono, c.localidad].filter(Boolean).join(' · ') || 'Sin teléfono cargado')}</p>
      <p class="info-sub">${f.vinculo === 'manual' ? 'Vinculado a mano.' : 'Se reconoció por el teléfono.'}</p>
    </div>`)
    partes.push(`<div class="info-filas">
      ${EMBEBIDO ? `<button class="info-fila" data-act="crm-ver">${ic('user')}<span>Ver ficha en el CRM</span></button>` : ''}
      <button class="info-fila solo-escritura" data-act="crm-form" data-form="seguimiento">${ic('file')}<span>Registrar seguimiento</span></button>
      <button class="info-fila solo-escritura" data-act="crm-form" data-form="tarea">${ic('clock')}<span>Crear tarea</span></button>
      <button class="info-fila solo-escritura" data-act="crm-form" data-form="vincular">${ic('unlink')}<span>${f.vinculo === 'manual' ? 'Cambiar el cliente' : 'No es este cliente'}</span></button>
    </div>`)
  } else {
    partes.push(`<p class="info-vacio">${f.vinculo === 'ninguno' ? 'Marcado como que no es cliente del CRM.' : 'Este número no está cargado como cliente.'}</p>
    <div class="info-filas">
      <button class="info-fila solo-escritura" data-act="crm-form" data-form="crear">${ic('plus')}<span>Crear cliente</span></button>
      <button class="info-fila solo-escritura" data-act="crm-form" data-form="vincular">${ic('search')}<span>Vincular a un cliente existente</span></button>
    </div>`)
  }
  if (crmUi.form) partes.push(formCrm(crmUi.form, f))
  el.innerHTML = partes.join('')
  el.querySelector('form [autofocus]')?.focus()
}

function formCrm(tipo, f) {
  const botones = (ok) => `<div class="crm-botones"><button type="button" class="btn ghost" data-act="crm-cancelar">Cancelar</button><button class="btn primary">${ok}</button></div><p class="crm-err" hidden></p>`
  if (tipo === 'crear') {
    const nombre = info.ficha?.nombre && !/^\+?\d[\d\s]*$/.test(info.ficha.nombre) ? info.ficha.nombre : ''
    return `<form class="crm-form" data-crm-form="crear">
      <label>Nombre<input name="nombre" required maxlength="120" value="${esc(nombre)}" autofocus></label>
      <label>Localidad<input name="localidad" maxlength="80"></label>
      <label>Notas<textarea name="notas" rows="2" maxlength="1000"></textarea></label>
      <p class="info-sub">Teléfono: ${esc(f.telefono || 'desconocido')} · Canal: WhatsApp</p>
      ${botones('Crear cliente')}</form>`
  }
  if (tipo === 'seguimiento') {
    return `<form class="crm-form" data-crm-form="seguimiento">
      <label>Qué se habló<textarea name="texto" rows="3" required maxlength="2000" autofocus placeholder="Ej.: pidió precio del Corolla, le paso cotización el lunes"></textarea></label>
      ${botones('Guardar')}</form>`
  }
  if (tipo === 'tarea') {
    const yo = sesion.usuario?.id
    const opciones = (crmUi.usuarios || []).map((u) => `<option value="${esc(u.id)}"${u.id === yo ? ' selected' : ''}>${esc(u.nombre || u.usuario)}</option>`).join('')
    return `<form class="crm-form" data-crm-form="tarea">
      <label>Tarea<input name="titulo" required maxlength="200" autofocus placeholder="Ej.: Llamar para coordinar la prueba de manejo"></label>
      <div class="crm-par"><label>Fecha<input type="date" name="fecha" required value="${hoyISO()}"></label><label>Hora<input type="time" name="hora"></label></div>
      <div class="crm-par"><label>Prioridad<select name="prioridad"><option value="baja">Baja</option><option value="normal" selected>Normal</option><option value="alta">Alta</option></select></label>
      ${opciones ? `<label>Para<select name="asignadoA">${opciones}</select></label>` : ''}</div>
      <label>Detalle<textarea name="descripcion" rows="2" maxlength="1000"></textarea></label>
      ${botones('Crear tarea')}</form>`
  }
  // vincular
  const filas = crmUi.resultados.map((c) => `<li><button type="button" class="crm-res" data-act="crm-elegir" data-cliente="${esc(c.id)}"><b>${esc(c.nombre)}</b><span>${esc(c.telefono || '')}</span></button></li>`).join('')
  return `<form class="crm-form" data-crm-form="vincular">
    <label>Buscar cliente<input name="q" id="crmBuscar" autocomplete="off" autofocus placeholder="Nombre o teléfono"></label>
    <ul class="crm-resultados">${filas}</ul>
    <div class="crm-botones">${f.vinculo === 'telefono' ? '<button type="button" class="btn ghost" data-act="crm-desvincular" data-cliente="ninguno">No es cliente</button>' : ''}${f.vinculo === 'manual' || f.vinculo === 'ninguno' ? '<button type="button" class="btn ghost" data-act="crm-desvincular">Reconocer por el teléfono</button>' : ''}<button type="button" class="btn ghost" data-act="crm-cancelar">Cancelar</button></div>
    <p class="crm-err" hidden></p></form>`
}

let crmBusqueda = 0
async function buscarClienteCrm(q) {
  const n = ++crmBusqueda
  const lista = q.trim().length < 2 ? [] : await api(`/api/crm/clientes?q=${enc(q)}`).catch(() => [])
  if (n !== crmBusqueda) return
  crmUi.resultados = lista
  const ul = $('#crmBloque .crm-resultados')
  if (!ul) return
  ul.innerHTML = lista.length
    ? lista.map((c) => `<li><button type="button" class="crm-res" data-act="crm-elegir" data-cliente="${esc(c.id)}"><b>${esc(c.nombre)}</b><span>${esc(c.telefono || '')}</span></button></li>`).join('')
    : q.trim().length >= 2 ? '<li class="info-vacio">Sin coincidencias.</li>' : ''
}

async function abrirFormCrm(tipo) {
  crmUi.form = tipo
  crmUi.resultados = []
  if (tipo === 'tarea' && !crmUi.usuarios) crmUi.usuarios = await api('/api/crm/usuarios').catch(() => [])
  renderCrm()
}

/** Guarda lo del formulario (crear cliente, seguimiento, tarea) o el vínculo elegido. */
async function enviarCrm(tipo, datos, boton) {
  const chat = crmUi.chat
  const err = $('#crmBloque .crm-err')
  if (err) err.hidden = true
  if (boton) boton.disabled = true
  const ruta = { crear: 'cliente', seguimiento: 'seguimiento', tarea: 'tarea', vincular: 'vincular' }[tipo]
  try {
    const r = await api(`/api/chats/${enc(chat)}/crm/${ruta}`, { method: 'POST', json: datos })
    if (crmUi.chat !== chat) return
    crmUi.form = null
    if (r?.configurado !== undefined) crmUi.ficha = r
    renderCrm()
    toast({ crear: 'Cliente creado en el CRM.', seguimiento: 'Seguimiento registrado en el CRM.', tarea: 'Tarea creada en el CRM.', vincular: datos.clienteId === 'ninguno' ? 'Listo: este chat no es de ese cliente.' : datos.clienteId ? 'Chat vinculado al cliente.' : 'Se vuelve a reconocer por el teléfono.' }[tipo])
  } catch (e) {
    if (err) {
      err.textContent = e.message
      err.hidden = false
    } else toast(e.message)
    if (boton) boton.disabled = false
  }
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

  // El cliente del CRM se pide aparte (no demora la ficha) y se dibuja en este hueco.
  if (!f.esGrupo && !f.sinChat && state.config?.crm) partes.push('<div class="info-bloque crm-bloque" id="crmBloque"><h4>Cliente del CRM</h4><p class="info-vacio">Buscando…</p></div>')

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
    ${f.sinChat ? '' : `<button class="info-fila" data-chat-act="exportar">${ic('download')}<span>Exportar chat</span></button>`}
  </div>`)

  // Solo quien maneja la línea: borra el chat del respaldo (mensajes, archivos y foto). En
  // el celular sigue estando; queda en la auditoría.
  if (puede.linea() && !f.sinChat) {
    partes.push(`<div class="info-bloque info-filas">
      <button class="info-fila peligro" data-chat-act="borrar-respaldo">${ic('unlink')}<span>Borrar chat del respaldo</span></button>
    </div>`)
  }

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
  const url = rutaApi(`/api/chats/${enc(f.id)}/media/${enc(m.id)}`)
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
    return `<a class="icon-btn" href="${rutaApi(`/api/chats/${enc(f.id)}/media/${enc(m.id)}?descargar=1`)}" aria-label="Descargar" title="Descargar">${ic('download')}</a>`
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
  const url = rutaApi(`/api/chats/${enc(f.id)}/media/${enc(m.id)}`)
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
  // Sin servidor (solo lectura) quedan las opciones que no cambian nada: copiar, bajar, ver.
  const lectura = sinServidor()
  menu.innerHTML = `
    ${lectura ? '' : `<div class="reac-bar">${REACCIONES.map((e) => `<button data-reaccionar="${e}" aria-pressed="${mia === e}" aria-label="Reaccionar con ${e}">${e}</button>`).join('')}</div>
    <button class="item" role="menuitem" data-act="responder">${ic('reply')}Responder</button>
    <button class="item" role="menuitem" data-act="reenviar">${ic('send')}Reenviar</button>
    <button class="item" role="menuitem" data-act="seleccionar">${ic('check')}Seleccionar mensajes</button>`}
    ${m.texto ? `<button class="item" role="menuitem" data-act="copiar">${ic('copy')}Copiar texto</button>` : ''}
    ${m.media?.estado === 'ok' ? `<a class="item" role="menuitem" style="color:inherit;text-decoration:none" href="${urlMedia(m)}&descargar=1" target="_blank" rel="noopener">${ic('download')}Descargar</a>` : ''}
    ${m.citado ? `<button class="item" role="menuitem" data-act="ir-citado">${ic('reply')}Ir al mensaje citado</button>` : ''}
    ${lectura ? '' : `<button class="item" role="menuitem" data-act="destacar">${ic('fijado')}${m.destacado ? 'Quitar destacado' : 'Destacar'}</button>`}
    ${m.eliminado ? `<button class="item" role="menuitem" data-act="ver-eliminado">${ic('history')}${state.revelados.has(m.id) ? 'Ocultar el original' : 'Ver qué decía'}</button>` : ''}
    ${lectura ? '' : `<button class="item" role="menuitem" data-act="info-msg">${ic('circle-check')}Información</button>`}
    ${puedeEliminar && !lectura ? `<button class="item peligro" role="menuitem" data-act="eliminar-msg">${ic('x')}Eliminar para todos</button>` : ''}`
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
    ${c.noLeidos ? '' : `<button class="item" role="menuitem" data-chat-act="no-leido">${ic('chat')}Marcar como no leído</button>`}
    <button class="item" role="menuitem" data-chat-act="exportar">${ic('download')}Exportar chat</button>`
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
  archivar: (c) => (c.archivado ? 'Chat archivado. En el celular se aplica en unos segundos.' : 'Chat desarchivado.'),
  fijar: (c) => (c.fijado ? 'Chat fijado arriba.' : 'El chat ya no está fijado.'),
  silenciar: () => 'Chat silenciado. En el celular se aplica en unos segundos.',
  'activar-sonido': () => 'Avisos reactivados.',
  'no-leido': () => 'Marcado como no leído.',
}

/**
 * Archiva, fija o silencia. El servidor lo aplica al instante y lo manda al celular por una
 * cola (de a uno, para que WhatsApp no corte por "rate-overlimit"); si WhatsApp lo rechaza,
 * el chat vuelve como estaba solo (llega por el evento "chat").
 */
async function accionChat(id, accion, valor) {
  cerrarMenu()
  if (!id) return
  const c = state.chats.get(id)
  if (!c) return
  if (accion === 'borrar-respaldo') {
    const pregunta = 'Se borran sus mensajes, fotos, audios y documentos guardados (también en Cloudflare). En el celular el chat sigue igual. No se puede deshacer.'
    if (!(await confirmar(pregunta, { titulo: `¿Borrar "${c.nombre}" del respaldo?`, aceptar: 'Borrar' }))) return
    try {
      const r = await api(`/api/chats/${enc(id)}/borrar`, { method: 'POST' })
      toast(`Chat borrado del respaldo: ${r.mensajes} mensajes y ${r.archivos} archivos.`, 5000)
    } catch (err) {
      toast(err.message)
    }
    return
  }
  if (accion === 'exportar') {
    // Como "Exportar chat" del celular: un .txt con todos los mensajes guardados.
    toast('Preparando el chat…', 30000)
    try {
      await bajarArchivo(`/api/chats/${enc(id)}/exportar`, 'chat.txt')
      toast('Chat exportado.')
    } catch (err) {
      toast(err.message)
    }
    return
  }
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

/**
 * Barras de la nota de voz. Si el mensaje trae su forma de onda real (las del celular la
 * traen; las demás la calcula el servidor al bajar el audio) se usa esa, reducida a 34
 * barras. Si no, una de relleno estable por id, para que no quede vacía.
 */
function onda(id) {
  const reales = state.mensajes.get(id)?.media?.ondas
  if (Array.isArray(reales) && reales.length) {
    const n = 34
    const paso = reales.length / n
    return Array.from({ length: n }, (_, i) => {
      const tramo = reales.slice(Math.floor(i * paso), Math.max(Math.floor(i * paso) + 1, Math.floor((i + 1) * paso)))
      return 12 + (Math.max(...tramo) / 100) * 88
    })
  }
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
  // Sin conexión se puede escribir igual: el mensaje queda en la bandeja de salida y se
  // manda solo cuando vuelve. Solo cambia el aviso del cuadro de texto.
  const sinConexion = !conectado()
  const off = false
  state.composerOff = sinConexion
  if (state.grabacion) {
    el.innerHTML = `<div class="recording"><span class="pulse"></span><span class="tnum" id="recT">0:00</span> Grabando nota de voz<button class="cancel" data-act="rec-cancelar">Cancelar</button></div>
      <button class="send" data-act="rec-enviar" aria-label="Enviar nota de voz">${ic('send')}</button>`
    return
  }
  el.innerHTML = `
    <button class="icon-btn" id="emojiBtn" data-act="emojis" aria-label="Emojis" title="Emojis" aria-haspopup="dialog" aria-expanded="false" ${off ? 'disabled' : ''}>${ic('smile')}</button>
    <button class="icon-btn" data-act="adjuntar" aria-label="Adjuntar foto, video o documento" title="Adjuntar" ${off ? 'disabled' : ''}>${ic('clip')}</button>
    <div class="field"><textarea id="msgInput" rows="1" placeholder="${sinConexion ? 'Sin conexión: lo que mandes sale cuando vuelva' : 'Escribí un mensaje'}" aria-label="Mensaje" ${off ? 'disabled' : ''}></textarea></div>
    <button class="send rec" id="sendBtn" data-act="grabar" aria-label="Grabar nota de voz" ${off ? 'disabled' : ''}>${ic('mic')}</button>
    <div class="mencion-panel" id="mencionPanel" role="listbox" aria-label="Mencionar a un integrante" hidden></div>`
  const ta = $('#msgInput')
  ta.value = borradores.get(state.activo) || ''
  autoAlto(ta)
  syncSendBtn()
}

function actualizarComposer() {
  if (state.activo && !state.grabacion && state.composerOff !== !conectado()) renderComposer()
}

/* ---------------- Menciones (@) en grupos ---------------- */

// Integrantes del grupo abierto ({ jid, telefono, nombre }) y los mencionados del borrador.
let integrantesChat = { chat: null, lista: [] }
const mencionesBorrador = new Map() // jid → nombre

async function cargarIntegrantes(chat) {
  if (integrantesChat.chat === chat) return integrantesChat.lista
  const lista = await api(`/api/chats/${enc(chat)}/integrantes`).catch(() => [])
  integrantesChat = { chat, lista }
  state.nombresIntegrantes = new Map(lista.map((p) => [p.jid, p.nombre]))
  return lista
}

/** Con "@algo" justo antes del cursor, en un grupo, muestra a quién mencionar. */
async function revisarMencion() {
  const ta = $('#msgInput')
  const panel = $('#mencionPanel')
  if (!ta || !panel) return
  const antes = ta.value.slice(0, ta.selectionStart)
  const m = /(^|\s)@([^\s@]{0,30})$/.exec(antes)
  if (!esGrupoActivo() || !m) {
    panel.hidden = true
    return
  }
  const chat = state.activo
  const lista = await cargarIntegrantes(chat)
  if (state.activo !== chat) return
  const q = m[2].toLowerCase()
  const opciones = lista.filter((p) => !q || p.nombre.toLowerCase().includes(q) || (p.telefono || '').includes(q)).slice(0, 8)
  if (!opciones.length) {
    panel.hidden = true
    return
  }
  panel.innerHTML = opciones
    .map((p) => `<button type="button" role="option" data-mencion="${esc(p.jid)}" data-nombre="${esc(p.nombre)}">${ic('user')}<span>${esc(p.nombre)}</span>${p.telefono && p.telefono !== p.nombre ? `<small class="tnum">${esc(p.telefono)}</small>` : ''}</button>`)
    .join('')
  panel.hidden = false
}

/** Cambia el "@algo" que se está escribiendo por "@número" y lo anota como mención. */
function ponerMencion(jid, nombre) {
  const ta = $('#msgInput')
  if (!ta) return
  const antes = ta.value.slice(0, ta.selectionStart)
  const despues = ta.value.slice(ta.selectionStart)
  const numero = jid.split('@')[0]
  const nuevoAntes = antes.replace(/@([^\s@]{0,30})$/, `@${numero} `)
  ta.value = nuevoAntes + despues
  ta.selectionStart = ta.selectionEnd = nuevoAntes.length
  mencionesBorrador.set(jid, nombre)
  $('#mencionPanel').hidden = true
  ta.focus()
  syncSendBtn()
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
  // Solo las menciones que siguen en el texto (se pudieron borrar después de elegirlas).
  const menciones = [...mencionesBorrador.keys()].filter((jid) => texto.includes(`@${jid.split('@')[0]}`))
  mencionesBorrador.clear()
  if ($('#mencionPanel')) $('#mencionPanel').hidden = true
  try {
    const r = await api(`/api/chats/${enc(chat)}/texto`, { method: 'POST', json: { texto, citadoId, menciones } })
    if (r?.enCola) toast('Sin conexión: el mensaje quedó en la bandeja de salida y se manda solo cuando vuelva.', 5000)
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
  if (file.size > limiteSubidaMb() * 1024 * 1024) {
    // Más grande que lo que deja pasar el túnel: se manda desde el celular de la línea.
    const porTunel = limiteSubidaMb() < limiteMb()
    return toast(`El archivo supera ${textoMb(limiteSubidaMb())}${porTunel ? ', lo máximo que se puede mandar desde el CRM. Mandalo desde el celular de la línea (WhatsApp acepta hasta 2 GB).' : '.'}`, 7000)
  }
  const input = $('#msgInput')
  const texto = input?.value.trim() || ''
  const params = new URLSearchParams({ nombre: file.name })
  if (texto) params.set('texto', texto)
  toast(`Enviando ${file.name}…`, 60000)
  try {
    const r = await api(`/api/chats/${enc(state.activo)}/archivo?${params}`, {
      method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' },
    })
    if (input) {
      input.value = ''
      autoAlto(input)
      guardarBorrador(state.activo, '')
      syncSendBtn()
    }
    toast(r?.enCola ? 'Sin conexión: el archivo quedó en la bandeja de salida y se manda solo cuando vuelva.' : 'Archivo enviado.', r?.enCola ? 5000 : 3200)
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
      const r = await api(`/api/chats/${enc(g.chat)}/nota-voz?segundos=${segundos}`, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type } })
      toast(r?.enCola ? 'Sin conexión: la nota de voz quedó en la bandeja de salida y se manda sola cuando vuelva.' : 'Nota de voz enviada.', r?.enCola ? 5000 : 3200)
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
  servicio: ['off', 'Servidor sin conexión'],
  nube: ['wait', 'Solo lectura · servidor apagado'],
}

let actualizando = false
const puedeActualizar = () => puede.escribir() && state.conn.conexion === 'conectado'

/**
 * El botón de actualizar: trae del celular los chats (archivados, fijados, silenciados) y
 * los grupos en los que está la línea, todo de una vez.
 */
async function actualizarTodo() {
  if (actualizando || !puedeActualizar()) return
  actualizando = true
  renderPill()
  toast('Trayendo chats y grupos de WhatsApp…', 120000)
  try {
    const chats = await api('/api/sincronizar-chats', { method: 'POST' })
    const grupos = await api('/api/sincronizar-grupos', { method: 'POST' })
    toast(`Listo: ${chats.archivados} archivados, ${chats.fijados} fijados y ${grupos.grupos} grupos${grupos.nuevos ? ` (${grupos.nuevos} nuevos)` : ''}.`, 5000)
    sincronizar()
  } catch (err) {
    toast(err.message)
  } finally {
    actualizando = false
    renderPill()
  }
}

function renderPill() {
  const { conexion, yo } = state.conn
  const [cls, texto] = TEXTO_CONEXION[conexion] || TEXTO_CONEXION.iniciando
  const etiqueta = conexion === 'conectado' ? `Conectada · ${yo?.telefono || ''}` : conexion === 'qr' ? 'Sin vincular' : texto
  $('#linePill').innerHTML = `<span class="dot ${cls}"></span><span class="tnum">${esc(etiqueta)}</span>`
  const btn = $('#btnActualizar')
  btn.hidden = !puede.escribir()
  btn.disabled = actualizando || !puedeActualizar()
  btn.classList.toggle('girando', actualizando)
  // Embebido, el encabezado lo dibuja el CRM con estos datos.
  avisarAlCrm({
    tipo: 'nf-wa:estado',
    conexion,
    clase: cls,
    texto: conexion === 'conectado' ? 'Conectada' : etiqueta,
    telefono: conexion === 'conectado' ? yo?.telefono || null : null,
    vista: state.view,
    hayLinea: hayLinea(),
    puedeActualizar: puede.escribir(),
    actualizarHabilitado: puedeActualizar(),
    actualizando,
  })

  const banner = $('#banner')
  if (conexion === 'conectado' || state.view === 'connect') {
    banner.hidden = true
    return
  }
  let mensaje
  if (conexion === 'nube' && state.conn.errorNube) mensaje = `<b>No se pudieron leer los chats guardados.</b> ${esc(state.conn.errorNube)} Probá de nuevo en un rato o avisale a quien administra el sistema.`
  else if (conexion === 'nube') mensaje = '<b>Modo lectura.</b> La PC servidor del WhatsApp está apagada: ves los chats y mensajes guardados y podés bajar los archivos que ya estaban descargados. Para escribir tiene que estar encendida; se conecta sola cuando vuelva.'
  else if (conexion === 'servicio') mensaje = '<b>El servidor de WhatsApp no responde.</b> La PC servidor está apagada o la app cerrada. Los chats vuelven solos cuando se reconecte.'
  else if (conexion === 'qr') mensaje = 'La línea no está vinculada: podés ver los chats guardados, pero no enviar.'
  else mensaje = `${esc(texto)} Mientras tanto podés ver los chats guardados.`
  banner.innerHTML = `<span>${mensaje}</span>${conexion === 'servicio' || conexion === 'nube' ? '' : '<button class="btn ghost" data-view="connect">Ir a Conexión</button>'}`
  banner.hidden = false
}

function renderConexion() {
  const { conexion, qr, yo, intentos, numeroLinea, rechazo } = state.conn
  const [cls, texto] = TEXTO_CONEXION[conexion] || TEXTO_CONEXION.iniciando
  // Reconectar y desvincular son de quien maneja la línea (WHATSAPP_ROLES_LINEA).
  const acciones = !puede.linea()
    ? ''
    : conexion === 'conectado'
      ? `<button class="btn ghost" data-act="reconectar">${ic('refresh')}Reconectar</button><button class="btn ghost" data-act="desvincular">${ic('unlink')}Desvincular</button>`
      : conexion === 'desconectado' ? `<button class="btn primary" data-act="reconectar">${ic('refresh')}Reconectar</button>` : ''

  $('#lineaCard').innerHTML = `
    <h2>Línea de WhatsApp</h2>
    <p class="card-sub">El número de la concesionaria. Se vincula una sola vez y lo usan todos.</p>
    <div class="status-row">
      <span class="avatar">${ic('phone')}</span>
      <div>
        <div class="phone tnum">${esc(conexion === 'conectado' || conexion === 'nube' ? yo?.telefono || yo?.id : 'Sin vincular')}</div>
        <div class="state"><span class="dot ${cls}"></span>${esc(texto)}${conexion === 'conectando' && intentos ? ` · intento ${intentos}` : ''}</div>
      </div>
      <div class="actions">${acciones}</div>
    </div>
    ${conexion === 'conectado' && yo?.nombre ? `<p class="path">Nombre de la cuenta: ${esc(yo.nombre)}</p>` : ''}`

  let cuerpo
  if (conexion === 'conectado') {
    cuerpo = `<div class="conn-ok">${ic('circle-check')}<div>La línea está vinculada.</div></div>`
  } else if (conexion === 'qr' && !puede.linea()) {
    cuerpo = `<div class="conn-ok">${ic('clock')}<div>La línea no está vinculada. Pedile a un administrador que la vincule desde su usuario.</div></div>`
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
  } else if (conexion === 'nube') {
    // Leyendo de la base con la PC servidor apagada: la línea sigue vinculada.
    cuerpo = `<div class="conn-ok">${ic('clock')}<div>La PC servidor está apagada o la app cerrada. La línea sigue vinculada: cuando el servidor vuelva se conecta solo y se puede volver a escribir. Mientras tanto se ven los chats guardados.</div></div>`
  } else {
    cuerpo = `<div class="conn-ok">${ic('clock')}<div>${esc(texto)}</div></div>`
  }
  $('#vincularCard').innerHTML = `<h2>Vincular WhatsApp</h2>${cuerpo}`
}

const NIVEL_LOG = { ok: ['', 'Listo'], info: ['info', 'Info'], aviso: ['wait', 'Aviso'], error: ['off', 'Error'] }
const esProblema = (l) => l.nivel === 'aviso' || l.nivel === 'error'

/** Actividad del servidor (solo administradores): por día, con hora, tipo, qué pasó y quién. */
function renderLog() {
  if (!puede.linea()) return
  const filtro = state.logFiltro || 'todo'
  const problemas = state.logs.filter(esProblema).length
  $('#logFiltros').innerHTML = [['todo', 'Todo', state.logs.length], ['problemas', 'Avisos y errores', problemas]]
    .map(([id, label, n]) => `<button class="chip" data-act="log-filtro" data-valor="${id}" aria-pressed="${filtro === id}">${label}<em class="tnum">${n}</em></button>`)
    .join('')
  const logs = (filtro === 'todo' ? state.logs : state.logs.filter(esProblema)).slice(0, 200)
  if (!logs.length) {
    $('#logList').innerHTML = `<p class="log-vacio">${filtro === 'todo' ? 'Sin actividad todavía.' : 'Sin avisos ni errores: todo en orden.'}</p>`
    return
  }
  const filas = ['<div class="log-fila log-cabeza"><span>Hora</span><span>Tipo</span><span>Qué pasó</span><span>Quién</span></div>']
  let dia = null
  for (const l of logs) {
    const d = new Date(l.ts)
    const esteDia = diaDe(l.ts / 1000)
    if (esteDia !== dia) {
      dia = esteDia
      filas.push(`<div class="log-dia">${esc(dia)}</div>`)
    }
    const [cls, nivel] = NIVEL_LOG[l.nivel] || NIVEL_LOG.info
    filas.push(`<div class="log-fila ${esc(l.nivel)}">
      <time class="tnum">${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}</time>
      <span class="log-nivel"><span class="dot ${cls}"></span>${nivel}</span>
      <div class="log-texto">${esc(l.texto)}${l.detalle ? `<small>${esc(l.detalle)}</small>` : ''}</div>
      <span class="log-quien">${esc(l.quien || 'Servidor')}</span>
    </div>`)
  }
  $('#logList').innerHTML = filas.join('')
}

function renderPrefs() {
  $$('[data-pref]').forEach((b) => b.setAttribute('aria-checked', String(!!state.config[b.dataset.pref])))
}

function onEstado(nuevo) {
  const antes = state.conn
  const habiaLinea = !!antes.yo
  state.conn = nuevo
  // Sin servidor no se puede leer ni mandar nada: se vuelve a la bandeja, se cierra el chat
  // y la lista queda bloqueada hasta que vuelva (ver servidorCaido / .sin-servidor).
  const caido = nuevo.conexion === 'servicio' || nuevo.conexion === 'nube'
  document.documentElement.classList.toggle('sin-servidor', caido)
  // En modo lectura (nube) no se "perdió" nada: se entró así a propósito.
  if (nuevo.conexion === 'servicio' && antes.conexion !== 'servicio') servidorCaido()
  // Volvió el servidor: se va el "Solo lectura" del chat abierto.
  if (!caido && ['servicio', 'nube'].includes(antes.conexion) && state.activo) renderHead()
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

/**
 * El servidor dejó de responder: queda todo en solo lectura. El chat abierto sigue a la
 * vista y se pueden abrir otros para leer lo que ya estaba cargado; escribir y cambiar
 * cosas vuelve solo cuando se reconecte.
 */
function servidorCaido() {
  if (state.activo) guardarLeido(state.activo)
  if (state.view !== 'inbox' && hayLinea()) setView('inbox')
  if (state.activo) renderHead()
  toast('Se perdió la conexión con el servidor de WhatsApp. Podés seguir leyendo; escribir vuelve solo cuando se reconecte.', 6000)
}

/** Sale del chat abierto y vuelve a la pantalla de bienvenida, como Esc en WhatsApp Web. */
function cerrarChat() {
  if (!state.activo) return
  if (!$('#msgInput')?.value.trim()) guardarBorrador(state.activo, '')
  guardarLeido(state.activo)
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

// Al entrar (o al refrescar) no se sabe todavía si hay una línea vinculada: se muestra
// "Verificando la línea…" y recién con la respuesta del servidor se va a la bandeja o a
// Conexión. Así no se ve Conexión un instante antes de saltar a la bandeja.
let arrancando = true

function terminarArranque() {
  if (!arrancando) return
  arrancando = false
  $('#viewCargando').hidden = true
  setView(hayLinea() ? 'inbox' : 'connect')
}
// Por si el servidor no contesta nunca: no se queda cargando para siempre.
setTimeout(terminarArranque, 15000)

function setView(view) {
  if (view === 'inbox' && !hayLinea()) view = 'connect'
  if (arrancando) view = 'cargando'
  state.view = view
  $('#viewCargando').hidden = view !== 'cargando'
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
    renderPrivacidad()
  }
  renderPill()
}

/**
 * Lo que guarda el respaldo, según la definición de privacidad del servidor
 * (WA_CONSERVAR_ELIMINADOS / WA_CONSERVAR_EDICIONES, ver docs/PRIVACIDAD.md).
 */
function renderPrivacidad() {
  const c = state.config || {}
  const filas = [
    ['Mensajes eliminados para todos', c.conservarEliminados !== false ? 'Se conservan en el respaldo, marcados como eliminados.' : 'Se borran también del respaldo (como en el celular).'],
    ['Mensajes editados', c.conservarEdiciones !== false ? 'Se guarda la versión anterior.' : 'Se guarda solo la última versión.'],
    ['Fotos, videos y audios "para ver una vez"', 'No se guardan nunca: queda solo el aviso.'],
    ['Cuánto tiempo', `Los últimos ${c.ventanaDias || 365} días; lo anterior se borra solo cada día.`],
  ]
  $('#privacidadCard').innerHTML = `<ul class="priv">${filas.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ul>
    <p class="card-sub">Lo define la concesionaria en la configuración del servidor. Todo lo que se hace desde el panel queda registrado con el nombre de quien lo hizo.</p>`
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
    // La actividad del servidor es solo para administradores.
    const [estado, chats, logs] = await Promise.all([api('/api/estado'), api('/api/chats'), puede.linea() ? api('/api/log') : []])
    state.config = estado.config
    state.logs = logs
    state.chats = new Map(chats.map((c) => [c.id, c]))
    onEstado(estado)
    renderList()
    renderPrefs()
    terminarArranque()
    if (state.view === 'connect') renderLog()
    if (state.activo) abrirChat(state.activo)
  } catch (err) {
    // Leyendo de la base (PC apagada): si falla, se dice por qué en vez de "no responde".
    if (NUBE) onEstado({ ...state.conn, conexion: 'nube', yo: state.conn.yo || {}, errorNube: err.message })
    else onEstado({ ...state.conn, conexion: 'servicio' })
    terminarArranque()
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
    // Otra persona en el chat que tengo abierto: un administrador me lo tomó.
    if (state.activo && sesion.login && ocupanteDe(state.activo)) echadoDelChat(ocupanteDe(state.activo))
    if (state.activo) renderHead()
  })
  es.addEventListener('error', () => {
    // El navegador reintenta solo; un microcorte no tiene que cerrar el chat que se está usando.
    setTimeout(() => {
      if (es.readyState !== EventSource.OPEN) onEstado({ ...state.conn, conexion: 'servicio' })
    }, 4000)
  })
  es.addEventListener('estado', (e) => onEstado(JSON.parse(e.data)))
  es.addEventListener('chat', (e) => {
    const c = JSON.parse(e.data)
    state.chats.set(c.id, c)
    pedirLista()
    if (c.id === state.activo) renderHead()
  })
  // Chats que quedaron vacíos al pasar la ventana de días, o que se borraron del respaldo.
  es.addEventListener('chats-borrados', (e) => {
    const ids = JSON.parse(e.data).ids || []
    for (const id of ids) state.chats.delete(id)
    if (ids.includes(state.activo)) cerrarChat()
    pedirLista()
  })
  // Un mensaje que se quita (el borrador de la bandeja de salida cuando ya salió el real).
  es.addEventListener('mensaje-quitado', (e) => {
    const { chatId, id } = JSON.parse(e.data)
    if (chatId !== state.activo || !state.mensajes.delete(id)) return
    document.getElementById(domId(id))?.remove()
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
      av.insertAdjacentHTML('beforeend', `<img src="${rutaApi(`/api/chats/${enc(id)}/foto?v=${ts}`)}" alt="" loading="lazy">`)
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
  // Sin servidor es solo lectura: el menú del chat es para archivar, fijar, silenciar…
  if (sinServidor()) return
  abrirMenuChat(fila.dataset.chat, puntoDe(e))
})

document.addEventListener('click', async (e) => {
  // El panel de información del chat se cierra con un clic afuera. Se mira el recorrido del
  // clic (composedPath) porque lo de adentro puede redibujarse antes de llegar acá. No
  // cuentan el encabezado del chat (lo abre y lo cierra), los menús, los diálogos ni el visor.
  if (!$('#infoPane').hidden) {
    const dentro = e.composedPath().some((n) => n instanceof Element && n.matches('#infoPane, .who-btn, .menu-msg, dialog, #lightbox, #emojiPanel, #toast'))
    if (!dentro) cerrarInfo()
  }
  if (seleccion.activa) {
    const burbuja = e.target.closest('.msg')
    if (burbuja && !e.target.closest('[data-act]')) return alternarSeleccion(burbuja.dataset.id)
  }
  const enMenu = e.target.closest('#menuMsg, #menuChat, [data-opciones]')
  if (!enMenu) cerrarMenu()
  if (!e.target.closest('#emojiPanel, #emojiBtn')) cerrarEmojis()
  const emo = e.target.closest('[data-emoji]')
  if (emo) return ponerEmoji(emo.dataset.emoji)
  const t = e.target.closest('[data-chat],[data-filter],[data-play],[data-seek],[data-ver],[data-view],[data-act],[data-pref],[data-descargar],[data-opciones],[data-reaccionar],[data-cita],[data-velocidad],[data-revelar],[data-chat-act],[data-persona],[data-info-tab],[data-res],[data-fwd],[data-bajar],[data-salida-act],[data-mencion]')
  if (!t) {
    if (e.target.id === 'lightbox') $('#lightbox').hidden = true
    return
  }
  if (t.dataset.mencion) return ponerMencion(t.dataset.mencion, t.dataset.nombre)
  if (t.dataset.salidaAct) {
    // Bandeja de salida: reintentar un mensaje que falló, o descartarlo.
    const chat = state.activo
    const accion = t.dataset.salidaAct
    if (accion === 'descartar' && !(await confirmar('No se va a mandar.', { titulo: '¿Descartar este mensaje?', aceptar: 'Descartar' }))) return
    t.disabled = true
    try {
      const r = await api(`/api/chats/${enc(chat)}/salida/${enc(t.dataset.id)}/${accion}`, { method: 'POST' })
      if (accion === 'reintentar' && r?.id && state.activo === chat) onMensaje({ chatId: chat, mensaje: r })
    } catch (err) {
      toast(err.message)
      t.disabled = false
    }
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
      if (!(await confirmar('Desaparece del chat del contacto. Acá queda guardado el original.', { titulo: '¿Eliminar este mensaje para todos?', aceptar: 'Eliminar' }))) break
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
      if (!(await confirmar('Dejás de recibir sus mensajes. La conversación guardada queda acá.', { titulo: `¿Salir de "${f.nombre}"?`, aceptar: 'Salir del grupo' }))) break
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
    case 'crm-ver':
      // El CRM abre la ficha del cliente (el panel está embebido en el CRM).
      if (crmUi.ficha?.cliente) avisarAlCrm({ tipo: 'nf-wa:abrir', ruta: `/crm/clientes/${crmUi.ficha.cliente.id}` })
      break
    case 'crm-form':
      abrirFormCrm(t.dataset.form)
      break
    case 'crm-cancelar':
      crmUi.form = null
      renderCrm()
      break
    case 'crm-elegir':
      enviarCrm('vincular', { clienteId: t.dataset.cliente }, t)
      break
    case 'crm-desvincular':
      enviarCrm('vincular', { clienteId: t.dataset.cliente || null }, t)
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
    case 'bajar': irAlFinal(); break
    case 'buscar-mas': buscarEnMensajes({ mas: true }); break
    case 'nuevo-chat':
      $('#nuevoErr').hidden = true
      $('#dlgNuevo').showModal()
      break
    case 'cerrar-dlg': $('#dlgNuevo').close(); break
    case 'volver':
      // En el celular "Volver" cierra el chat de verdad: si no, seguía contando como abierto
      // (marcaba leído lo que llegaba y les decía a los demás que había alguien mirando).
      cerrarChat()
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
      if (await confirmar('Los chats guardados no se borran. Para volver a usar la línea hay que escanear el QR de nuevo.', { titulo: '¿Desvincular este WhatsApp?', aceptar: 'Desvincular' })) {
        api('/api/desvincular', { method: 'POST' }).then(() => toast('Línea desvinculada.')).catch((err) => toast(err.message))
      }
      break
    case 'actualizar': actualizarTodo(); break
    case 'exportar-todo':
      t.disabled = true
      toast('Preparando todos los chats… puede tardar un poco.', 120000)
      try {
        await bajarArchivo('/api/exportar', 'chats.zip')
        toast('Chats exportados: un .txt por chat dentro del .zip.', 5000)
      } catch (err) {
        toast(err.message)
      } finally {
        t.disabled = false
      }
      break
    case 'log-filtro':
      state.logFiltro = t.dataset.valor
      renderLog()
      break
    case 'lb-close':
      $('#lightbox').hidden = true
      $('#lbFig').innerHTML = ''
      break
  }
})

document.addEventListener('submit', async (e) => {
  const crmForm = e.target.dataset?.crmForm
  if (crmForm) {
    e.preventDefault()
    if (crmForm === 'vincular') return
    const datos = Object.fromEntries(new FormData(e.target))
    return enviarCrm(crmForm, datos, e.target.querySelector('.btn.primary'))
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
  if (e.target.id === 'search') alBuscar(e.target.value)
  if (e.target.id === 'fwdBuscar') renderReenviar(e.target.value)
  if (e.target.id === 'crmBuscar') buscarClienteCrm(e.target.value)
  if (e.target.id === 'msgInput') {
    autoAlto(e.target)
    syncSendBtn()
    guardarBorrador(state.activo, e.target.value)
    revisarMencion()
  }
})

document.addEventListener('keydown', (e) => {
  // Con el selector de menciones abierto, Enter elige el primero.
  if (e.key === 'Enter' && e.target.id === 'msgInput' && !$('#mencionPanel')?.hidden) {
    const primero = $('#mencionPanel [data-mencion]')
    if (primero) {
      e.preventDefault()
      return ponerMencion(primero.dataset.mencion, primero.dataset.nombre)
    }
  }
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
  // Leyendo de la base (PC servidor apagada) no hay eventos en vivo: se carga una vez.
  .then((ok) => ok && (NUBE ? arrancarNube() : conectarEventos()))
  .catch(() => pantallaSinSesion({ error: 'No se pudo conectar con el servidor del WhatsApp.' }))
