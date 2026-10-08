/* Lógica del mockup: todo simulado en memoria, sin servidor. */

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const ic = (n) => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const pad = (n) => String(n).padStart(2, '0')
const now = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const fmtDur = (s) => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`
const unitById = (id) => UNITS.find((u) => u.id === id)
let uid = 0
const newId = () => `x${++uid}`

const state = {
  view: 'inbox', active: 'c1', filter: 'todos', q: '',
  conn: 'connected', qrSeed: 7, qrLeft: 20, pairing: false,
  recording: null, picker: false, voice: {}, replied: {},
}
const cur = () => CHATS.find((c) => c.id === state.active)

/* ---------------- Toast ---------------- */
let toastTimer
function toast(text) {
  const el = $('#toast')
  el.textContent = text
  el.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (el.hidden = true), 2800)
}

/* ---------------- Lista de chats ---------------- */
const FILTERS = [
  { id: 'todos', label: 'Todos', test: () => true },
  { id: 'no-leidos', label: 'No leídos', test: (c) => c.unread > 0 },
  { id: 'sin-asignar', label: 'Sin asignar', test: (c) => !c.assigned },
  { id: 'mios', label: 'Míos', test: (c) => c.assigned === ME },
]

function initials(c) {
  if (!c.known) return '?'
  return c.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}
function lastMsg(c) {
  return [...c.msgs].reverse().find((m) => m.type !== 'day' && m.type !== 'sys')
}
function preview(c) {
  const m = lastMsg(c)
  if (!m) return { html: '', deleted: false }
  const who = m.dir === 'out' ? `${esc(m.author === ME ? 'Vos' : m.author)}: ` : ''
  if (m.deleted) return { html: `${ic('history')}Mensaje eliminado (guardado)`, deleted: true }
  const map = {
    text: esc(m.text),
    photo: `${ic('image')}Foto`,
    voice: `${ic('mic')}Nota de voz (${fmtDur(m.dur)})`,
    unit: `${ic('car')}${esc(unitById(m.unit).name)}`,
    doc: esc(m.file),
  }
  return { html: `${who}${map[m.type]}`, deleted: false }
}
const estadoTag = (e) => (e ? `<span class="tag ${ESTADOS[e][1]}">${ESTADOS[e][0]}</span>` : '')

function renderFilters() {
  $('#filters').innerHTML = FILTERS.map((f) => {
    const n = CHATS.filter(f.test).length
    return `<button class="chip" data-filter="${f.id}" aria-pressed="${state.filter === f.id}">${f.label}<em class="tnum">${n}</em></button>`
  }).join('')
}

function renderList() {
  renderFilters()
  const f = FILTERS.find((x) => x.id === state.filter)
  const q = state.q.trim().toLowerCase()
  const rows = CHATS.filter(f.test)
    .filter((c) => !q || [c.name, c.phone, c.pushName, ...c.msgs.map((m) => m.text)].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.order - a.order)

  $('#chatList').innerHTML = rows.length
    ? rows.map((c) => {
        const p = preview(c)
        const tags = c.known ? estadoTag(c.estado) : '<span class="tag">Sin ficha</span>'
        const who = c.assigned ? `<span class="tag">${esc(c.assigned === ME ? 'Vos' : c.assigned)}</span>` : '<span class="tag red">Sin asignar</span>'
        return `<button class="row ${c.id === state.active ? 'active' : ''}" data-chat="${c.id}">
          <span class="avatar ${c.known ? '' : 'unknown'}">${initials(c)}</span>
          <span class="row-main">
            <span class="row-top"><span class="row-name">${esc(c.name)}</span></span>
            ${c.pushName && !c.known ? `<span class="row-top sub">~${esc(c.pushName)}</span>` : ''}
            <span class="row-prev ${p.deleted ? 'deleted' : ''}">${p.html}</span>
            <span class="row-tags">${tags}${who}</span>
          </span>
          <span class="row-side"><span class="tnum">${c.lastT}</span>${c.unread ? `<span class="unread tnum">${c.unread}</span>` : ''}</span>
        </button>`
      }).join('')
    : '<div class="empty">No hay chats con ese filtro.</div>'

  const total = CHATS.reduce((s, c) => s + c.unread, 0)
  $('#navUnread').textContent = total
  $('#navUnread').hidden = total === 0
}

/* ---------------- Conversación ---------------- */
function statusIcon(s) {
  if (s === 'pending') return `<span title="Enviando">${ic('clock')}</span>`
  if (s === 'sent') return `<span title="Enviado">${ic('check')}</span>`
  if (s === 'delivered') return `<span title="Entregado">${ic('checks')}</span>`
  return `<span class="read" title="Leído">${ic('checks')}</span>`
}

function waveHeights(id) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return Array.from({ length: 34 }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0
    return 22 + ((h >>> 8) % 70) * (0.6 + 0.4 * Math.sin(i / 3))
  })
}

function voiceHtml(m) {
  const v = state.voice[m.id] || { p: 0, playing: false }
  const bars = waveHeights(m.id).map((h) => `<i style="height:${Math.min(100, h).toFixed(0)}%"></i>`).join('')
  return `<div class="voice" id="v-${m.id}">
    <button class="play" data-play="${m.id}" aria-label="${v.playing ? 'Pausar' : 'Reproducir'} nota de voz">${ic(v.playing ? 'pause' : 'play')}</button>
    <div class="wave" data-seek="${m.id}" role="slider" aria-label="Progreso de la nota de voz" aria-valuemin="0" aria-valuemax="${m.dur}" aria-valuenow="0">${bars}</div>
    <div class="voice-meta tnum"><span class="cur">${fmtDur(v.p * m.dur)}</span><span>${fmtDur(m.dur)}</span></div>
  </div>`
}

function msgHtml(m) {
  if (m.type === 'day') return `<div class="day">${esc(m.text)}</div>`
  if (m.type === 'sys') return `<div class="sys">${esc(m.text)}</div>`
  let body = ''
  if (m.type === 'text') body = `<div>${esc(m.text)}</div>`
  if (m.type === 'photo') body = `<button class="photo" data-photo="${m.id}" aria-label="Ampliar foto">${carSvg(m.photo)}</button>${m.text ? `<div>${esc(m.text)}</div>` : ''}`
  if (m.type === 'voice') body = voiceHtml(m)
  if (m.type === 'unit') {
    const u = unitById(m.unit)
    body = `${m.text ? `<div style="margin-bottom:6px">${esc(m.text)}</div>` : ''}<div class="unit"><div class="thumb">${carSvg(u.svg)}</div><div><b>${esc(u.name)}</b><span>${u.year} · ${fmtKm(u.km)} km</span><div class="price tnum">${u.price}</div><span>Ficha del catálogo</span></div></div>`
  }
  if (m.type === 'doc') body = `<div class="doc"><div class="ext">PDF</div><div><b>${esc(m.file)}</b><span>${m.size}</span></div></div>${m.text ? `<div>${esc(m.text)}</div>` : ''}`

  const del = m.deleted
    ? `<div class="del-note">${ic('history')}<span>${m.dir === 'in' ? 'El cliente lo eliminó' : 'Se eliminó'} a las ${m.deleted.at}. Neifert conserva el original.</span></div>`
    : ''
  const author = m.dir === 'out' ? `<div class="author">${esc(m.author)}</div>` : ''
  const meta = `<div class="meta">${m.edited ? '<span class="edited">editado</span>' : ''}<span class="tnum">${m.t}</span>${m.dir === 'out' ? statusIcon(m.status) : ''}</div>`
  return `<div class="msg ${m.dir} ${m.deleted ? 'deleted' : ''}">${del}${author}${body}${meta}</div>`
}

function renderHead() {
  const c = cur()
  const sub = c.known ? `${c.phone} · Cliente del CRM` : `${c.phone} · ~${esc(c.pushName)} · Sin ficha`
  $('#convHead').innerHTML = `
    <button class="icon-btn back-btn" data-act="back" aria-label="Volver a la lista">${ic('back')}</button>
    <span class="avatar ${c.known ? '' : 'unknown'}">${initials(c)}</span>
    <div class="who"><b>${esc(c.name)}</b><span>${sub}</span></div>
    <label class="assign" for="assignSel"><span class="lbl">Asignado a</span>
      <select id="assignSel">${['', ...VENDEDORES].map((v) => `<option value="${v}" ${v === c.assigned ? 'selected' : ''}>${v || 'Sin asignar'}</option>`).join('')}</select>
    </label>
    <button class="icon-btn" data-act="new-task" aria-label="Crear tarea para este cliente" title="Crear tarea">${ic('task')}</button>
    <button class="icon-btn info-btn" data-act="info" aria-label="Ver ficha del cliente">${ic('info')}</button>`
}

function renderMessages() {
  const box = $('#messages')
  box.innerHTML = cur().msgs.map(msgHtml).join('')
  cur().msgs.filter((m) => m.type === 'voice').forEach((m) => updateVoice(m.id))
  box.scrollTop = box.scrollHeight
}

function pickerHtml() {
  return `<div class="popover" role="dialog" aria-label="Compartir unidad del catálogo"><h3>Compartir unidad del catálogo</h3>${UNITS.map(
    (u) => `<button class="pick" data-act="send-unit" data-unit="${u.id}"><div class="thumb">${carSvg(u.svg)}</div><div><b>${esc(u.name)}</b><span>${u.year} · ${fmtKm(u.km)} km</span></div><b class="tnum">${u.price}</b></button>`,
  ).join('')}</div>`
}

function renderComposer() {
  const el = $('#composer')
  if (state.recording) {
    el.innerHTML = `<div class="recording"><span class="pulse"></span><span class="tnum" id="recT">0:00</span> Grabando nota de voz<button class="cancel" data-act="rec-cancel">Cancelar</button></div>
      <button class="send" data-act="rec-send" aria-label="Enviar nota de voz">${ic('send')}</button>`
    return
  }
  el.innerHTML = `${state.picker ? pickerHtml() : ''}
    <button class="icon-btn" data-act="attach" aria-label="Adjuntar foto, video o documento" title="Adjuntar">${ic('clip')}</button>
    <button class="icon-btn" data-act="picker" aria-label="Compartir unidad del catálogo" title="Compartir unidad">${ic('car')}</button>
    <div class="field"><input id="msgInput" placeholder="Escribí un mensaje" autocomplete="off" aria-label="Mensaje"></div>
    <button class="send rec" id="sendBtn" data-act="mic" aria-label="Grabar nota de voz">${ic('mic')}</button>`
}

/* ---------------- Ficha del cliente ---------------- */
function renderClient() {
  const c = cur()
  const top = `<div class="panel-top"><p class="section-label">Ficha del cliente</p><button class="icon-btn drawer-close" data-act="close-client" aria-label="Cerrar ficha">${ic('x')}</button></div>
    <div class="anno"><b>CRM</b> Se cruza por teléfono con la tabla de clientes. Si el número no existe, se ofrece crearlo.</div>`

  if (!c.known) {
    $('#clientPanel').innerHTML = `${top}
      <div class="client-id"><span class="avatar unknown">?</span><h2>${esc(c.phone)}</h2><p>Nombre en WhatsApp: ${esc(c.pushName)}</p></div>
      <div class="new-client">
        <b>Este número no está en el CRM</b>
        Creá la ficha para asignar vendedor, cargar el interés y seguirlo con tareas.
        <button class="btn primary" data-act="create-client">${ic('userplus')}Crear cliente con este número</button>
      </div>`
    return
  }
  const cl = c.client
  const tasks = cl.tasks.length
    ? cl.tasks.map((t, i) => `<label class="task" for="task-${c.id}-${i}"><input type="checkbox" id="task-${c.id}-${i}" data-task="${i}" ${t.done ? 'checked' : ''}><div>${esc(t.t)}<span>${esc(t.when)}</span></div></label>`).join('')
    : '<p class="note-box">Sin tareas pendientes.</p>'
  const matches = cl.matches.length
    ? cl.matches.map(unitById).map((u) => `<div class="match"><div class="thumb">${carSvg(u.svg)}</div><div><b>${esc(u.name)}</b><span class="tnum">${u.year} · ${u.price}</span><br><button class="link-btn" data-act="send-unit" data-unit="${u.id}">Enviar por WhatsApp</button></div></div>`).join('')
    : '<p class="note-box">No hay unidades compatibles en stock.</p>'

  $('#clientPanel').innerHTML = `${top}
    <div class="client-id">
      <span class="avatar">${initials(c)}</span>
      <h2>${esc(c.name)}</h2>
      <p class="tnum">${c.phone} · ${esc(cl.localidad)}</p>
      <div class="tags">${estadoTag(c.estado)}<span class="tag">Canal: ${esc(c.canal)}</span></div>
    </div>
    <div class="btn-row">
      <button class="btn ghost" data-act="open-crm">${ic('external')}Abrir ficha</button>
      <button class="btn ghost" data-act="new-task">${ic('task')}Tarea</button>
    </div>
    <div>
      <p class="section-label">Interés</p>
      <dl class="kv">
        <dt>Busca</dt><dd>${esc(cl.busca)}</dd>
        <dt>Tipo</dt><dd>${esc(cl.tipo)}</dd>
        <dt>Años</dt><dd class="tnum">${esc(cl.anios)}</dd>
        <dt>Transmisión</dt><dd>${esc(cl.trans)}</dd>
        <dt>Presupuesto</dt><dd class="tnum">${esc(cl.presupuesto)}</dd>
      </dl>
    </div>
    <div><p class="section-label">Notas</p><p class="note-box">${esc(cl.notas)}</p></div>
    <div><p class="section-label">Tareas</p>${tasks}</div>
    <div><p class="section-label">Unidades compatibles</p>${matches}</div>`
}

function renderChat() {
  renderHead()
  renderMessages()
  renderComposer()
  renderClient()
}

/* ---------------- Notas de voz (reproducción simulada) ---------------- */
function findMsg(id) {
  for (const c of CHATS) { const m = c.msgs.find((x) => x.id === id); if (m) return m }
}
function updateVoice(id) {
  const el = document.getElementById(`v-${id}`)
  const m = findMsg(id)
  if (!el || !m) return
  const v = state.voice[id] || { p: 0, playing: false }
  const bars = $$('.wave i', el)
  const on = Math.round(v.p * bars.length)
  bars.forEach((b, i) => b.classList.toggle('on', i < on))
  $('.cur', el).textContent = fmtDur(v.p * m.dur)
  const btn = $('.play', el)
  btn.innerHTML = ic(v.playing ? 'pause' : 'play')
  btn.setAttribute('aria-label', `${v.playing ? 'Pausar' : 'Reproducir'} nota de voz`)
}
setInterval(() => {
  for (const [id, v] of Object.entries(state.voice)) {
    if (!v.playing) continue
    const m = findMsg(id)
    v.p = Math.min(1, v.p + 0.25 / m.dur)
    if (v.p >= 1) { v.playing = false; v.p = 0 }
    updateVoice(id)
  }
}, 250)

/* ---------------- Envío (simulado) ---------------- */
function pushOut(msg) {
  const c = cur()
  const m = { id: newId(), dir: 'out', author: ME, t: now(), status: 'pending', ...msg }
  c.msgs.push(m)
  c.order = Date.now()
  c.lastT = m.t
  if (!c.assigned) {
    c.assigned = ME
    c.msgs.splice(c.msgs.length - 1, 0, { type: 'sys', text: `${ME} tomó el chat al responder · ${m.t}` })
    renderHead()
  }
  renderMessages()
  renderList()
  const chatId = c.id
  const steps = [['sent', 700], ['delivered', 1600], ['read', 3800]]
  steps.forEach(([s, ms]) => setTimeout(() => { m.status = s; if (state.active === chatId) renderMessages() }, ms))

  if (!state.replied[chatId] && c.known) {
    state.replied[chatId] = true
    setTimeout(() => {
      c.msgs.push({ id: newId(), dir: 'in', type: 'text', t: now(), text: 'Buenísimo, gracias!' })
      c.order = Date.now(); c.lastT = now()
      if (state.active === chatId) renderMessages()
      else c.unread++
      renderList()
    }, 5200)
  }
}

let recTimer
function startRecording() {
  state.recording = { start: Date.now() }
  state.picker = false
  renderComposer()
  recTimer = setInterval(() => {
    const el = $('#recT')
    if (el) el.textContent = fmtDur((Date.now() - state.recording.start) / 1000)
  }, 250)
}
function stopRecording(send) {
  clearInterval(recTimer)
  const secs = Math.max(1, Math.round((Date.now() - state.recording.start) / 1000))
  state.recording = null
  renderComposer()
  if (send) pushOut({ type: 'voice', dur: secs })
  $('#msgInput')?.focus()
}

function sendText() {
  const input = $('#msgInput')
  const text = input.value.trim()
  if (!text) return
  input.value = ''
  syncSendBtn()
  pushOut({ type: 'text', text })
}
function syncSendBtn() {
  const btn = $('#sendBtn')
  if (!btn) return
  const has = $('#msgInput').value.trim().length > 0
  btn.classList.toggle('rec', !has)
  btn.dataset.act = has ? 'send' : 'mic'
  btn.setAttribute('aria-label', has ? 'Enviar mensaje' : 'Grabar nota de voz')
  btn.innerHTML = ic(has ? 'send' : 'mic')
}

/* ---------------- Conexión ---------------- */
function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
function drawQR(canvas, seed) {
  const N = 29, S = 8
  canvas.width = canvas.height = N * S
  const ctx = canvas.getContext('2d')
  const rnd = mulberry(seed)
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, N * S, N * S)
  ctx.fillStyle = '#0b0b0f'
  const inFinder = (x, y) => [[0, 0], [N - 8, 0], [0, N - 8]].some(([fx, fy]) => x >= fx && x < fx + 8 && y >= fy && y < fy + 8)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (inFinder(x, y)) continue
    const timing = (x === 6 || y === 6) && (x + y) % 2 === 0
    if (timing || ((x !== 6 && y !== 6) && rnd() > 0.52)) ctx.fillRect(x * S, y * S, S, S)
  }
  for (const [fx, fy] of [[0, 0], [N - 7, 0], [0, N - 7]]) {
    ctx.fillRect(fx * S, fy * S, 7 * S, 7 * S)
    ctx.fillStyle = '#fff'; ctx.fillRect((fx + 1) * S, (fy + 1) * S, 5 * S, 5 * S)
    ctx.fillStyle = '#0b0b0f'; ctx.fillRect((fx + 2) * S, (fy + 2) * S, 3 * S, 3 * S)
  }
}

function renderPill() {
  const map = {
    connected: ['', `Línea conectada · ${LINE_PHONE}`],
    qr: ['off', 'Línea sin vincular'],
    connecting: ['wait', 'Sincronizando chats…'],
  }
  const [cls, text] = map[state.conn]
  $('#linePill').innerHTML = `<span class="dot ${cls}"></span><span class="tnum">${text}</span>`
}

function renderLog() {
  $('#logList').innerHTML = LOG.map((l) => `<li><time>${l.t}</time><span class="dot ${l.tone === 'ok' ? '' : l.tone === 'off' ? 'off' : 'wait'}"></span><div>${esc(l.text)}<small>${esc(l.sub)}</small></div></li>`).join('')
}
function addLog(tone, text, sub) {
  LOG.unshift({ t: now(), tone, text, sub })
  renderLog()
}

function renderConnect() {
  const connected = state.conn === 'connected'
  const stateText = {
    connected: '<span class="dot"></span>Conectada · recibiendo y enviando mensajes',
    qr: '<span class="dot off"></span>Desvinculada · escaneá el código para volver a conectar',
    connecting: '<span class="dot wait"></span>Código escaneado · descargando chats recientes',
  }[state.conn]

  const lineCard = `<div class="card glass shadow">
    <h2>Línea de la agencia</h2>
    <p class="card-sub">Un solo número compartido por todo el equipo de ventas.</p>
    <div class="status-row">
      <span class="avatar">${ic('phone')}</span>
      <div><div class="phone tnum">${LINE_PHONE}</div><div class="state">${stateText}</div></div>
      <div class="actions">
        ${connected
          ? `<button class="btn ghost" data-act="reconnect">${ic('refresh')}Reconectar</button><button class="btn ghost" data-act="unlink">${ic('unlink')}Desvincular</button>`
          : ''}
      </div>
    </div>
    <div class="facts">
      <div class="fact"><span>Dispositivo</span><b>Neifert Panel</b></div>
      <div class="fact"><span>Vinculada desde</span><b>${connected ? '02/09/2026' : '—'}</b></div>
      <div class="fact"><span>Mensajes hoy</span><b>${connected ? '184' : '—'}</b></div>
      <div class="fact"><span>Chats con actividad</span><b>${connected ? '37' : '—'}</b></div>
    </div>
  </div>`

  let linkBody
  if (connected) {
    linkBody = `<div class="conn-ok">${ic('circle-check')}<div>La línea está vinculada. Para cambiar de número, desvinculá primero y escaneá con el celular nuevo.</div></div>`
  } else {
    const qr = `<div class="qr"><canvas id="qrCanvas" aria-label="Código QR de vinculación" role="img"></canvas>${state.conn === 'connecting' ? `<div class="done">${ic('circle-check')}<span>Código escaneado<br>Sincronizando…</span></div>` : ''}</div>`
    const alt = state.pairing
      ? `<div><p class="section-label">Código para vincular con número</p><div class="pair tnum">${'K7Q29MXA'.split('').map((ch, i) => `${i === 4 ? '<b aria-hidden="true">-</b>' : ''}<span>${ch}</span>`).join('')}</div></div>`
      : `<button class="link-btn" data-act="pairing">Vincular con número de teléfono en su lugar</button>`
    linkBody = `<div class="qr-wrap">${qr}
      <div class="stack">
        <ol class="steps">
          <li>Abrí <b>WhatsApp</b> en el celular de la agencia.</li>
          <li>Tocá <b>Menú ⋮</b> o <b>Configuración</b> y elegí <b>Dispositivos vinculados</b>.</li>
          <li>Tocá <b>Vincular un dispositivo</b> y apuntá la cámara a este código.</li>
        </ol>
        <span class="timer tnum" id="qrTimer">${state.conn === 'qr' ? `El código se renueva en ${state.qrLeft} s` : 'Esto tarda unos segundos.'}</span>
        ${state.conn === 'qr' ? `<div class="btn-row"><button class="btn primary" data-act="scan">Simular escaneo</button></div>${alt}` : ''}
      </div>
    </div>`
  }

  $('#connectMain').innerHTML = `${lineCard}
    <div class="card glass shadow">
      <h2>Vincular WhatsApp</h2>
      <div class="anno"><b>QR</b> El servicio de Baileys genera el código y lo manda al panel en vivo (en la app de Electron viajaba por IPC; acá va por WebSocket).</div>
      ${linkBody}
    </div>`
  const canvas = $('#qrCanvas')
  if (canvas) drawQR(canvas, state.qrSeed)
  renderPill()
}

setInterval(() => {
  if (state.conn !== 'qr') return
  state.qrLeft--
  if (state.qrLeft <= 0) {
    state.qrLeft = 20
    state.qrSeed++
    const canvas = $('#qrCanvas')
    if (canvas) drawQR(canvas, state.qrSeed)
  }
  const t = $('#qrTimer')
  if (t) t.textContent = `El código se renueva en ${state.qrLeft} s`
}, 1000)

/* ---------------- Vistas y tema ---------------- */
function setView(view) {
  state.view = view
  $('#viewInbox').hidden = view !== 'inbox'
  $('#viewConnect').hidden = view !== 'connect'
  $('#tabInbox').setAttribute('aria-selected', view === 'inbox')
  $('#tabConnect').setAttribute('aria-selected', view === 'connect')
  if (view === 'connect') renderConnect()
}

function isDark() {
  const t = document.documentElement.dataset.theme
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
}
function syncThemeIcons() {
  $$('[data-act="theme"]').forEach((b) => (b.innerHTML = ic(isDark() ? 'sun' : 'moon')))
}

function openLightbox(id) {
  const m = findMsg(id)
  $('#lbFig').innerHTML = `${carSvg(m.photo)}<figcaption><span>${esc(m.file)} · ${m.size}</span><span>Recibida a las ${m.t} · guardada en el servidor</span></figcaption>`
  $('#lightbox').hidden = false
  $('#lightbox .close').focus()
}

/* ---------------- Eventos ---------------- */
document.addEventListener('click', (e) => {
  if (e.target.closest('a[href="#"]')) e.preventDefault()
  const t = e.target.closest('[data-chat],[data-filter],[data-play],[data-seek],[data-photo],[data-view],[data-act]')
  if (!t) {
    if (state.picker && !e.target.closest('.popover')) { state.picker = false; renderComposer() }
    return
  }

  if (t.dataset.chat) {
    state.active = t.dataset.chat
    cur().unread = 0
    state.picker = false
    $('#viewInbox').classList.add('open')
    $('#viewInbox').classList.remove('show-client')
    renderList(); renderChat()
    return
  }
  if (t.dataset.filter) { state.filter = t.dataset.filter; renderList(); return }
  if (t.dataset.play) {
    const v = (state.voice[t.dataset.play] ||= { p: 0, playing: false })
    Object.entries(state.voice).forEach(([id, o]) => { if (id !== t.dataset.play && o.playing) { o.playing = false; updateVoice(id) } })
    v.playing = !v.playing
    updateVoice(t.dataset.play)
    return
  }
  if (t.dataset.seek) {
    const r = t.getBoundingClientRect()
    const v = (state.voice[t.dataset.seek] ||= { p: 0, playing: false })
    v.p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    updateVoice(t.dataset.seek)
    return
  }
  if (t.dataset.photo) { openLightbox(t.dataset.photo); return }
  if (t.dataset.view) { setView(t.dataset.view); return }

  const c = cur()
  switch (t.dataset.act) {
    case 'theme':
      document.documentElement.dataset.theme = isDark() ? 'light' : 'dark'
      try { localStorage.setItem('wa-mock-theme', document.documentElement.dataset.theme) } catch {}
      syncThemeIcons()
      break
    case 'attach': toast('Abre el selector de archivos: foto, video o documento.'); break
    case 'picker': state.picker = !state.picker; renderComposer(); break
    case 'send-unit':
      state.picker = false
      renderComposer()
      pushOut({ type: 'unit', unit: t.dataset.unit, text: '' })
      $('#viewInbox').classList.remove('show-client')
      toast('Unidad enviada con foto, año, kilómetros y precio.')
      break
    case 'mic': startRecording(); break
    case 'send': sendText(); break
    case 'rec-cancel': stopRecording(false); break
    case 'rec-send': stopRecording(true); break
    case 'create-client':
      c.known = true
      c.name = c.pushName
      c.estado = 'nuevo'
      c.client = { localidad: '—', presupuesto: '—', busca: 'Toma de usado: VW Gol Trend 2016', tipo: '—', anios: '—', trans: '—', notas: 'Ofrece Gol Trend 2016 con 120.000 km.', tasks: [], matches: [] }
      renderList(); renderChat()
      toast(`Cliente creado: ${c.name}. Completá el apellido en la ficha.`)
      break
    case 'open-crm': toast(`Abre la ficha de ${c.name} en CRM / Clientes.`); break
    case 'new-task': toast(`Abre "Nueva tarea" con ${c.name} ya cargado.`); break
    case 'info': $('#viewInbox').classList.add('show-client'); break
    case 'close-client': $('#viewInbox').classList.remove('show-client'); break
    case 'back': $('#viewInbox').classList.remove('open'); break
    case 'simulate-revoke': {
      const m = [...c.msgs].reverse().find((x) => x.dir === 'in' && !x.deleted)
      if (!m) { toast('Este chat no tiene mensajes del cliente para borrar.'); break }
      m.deleted = { at: now() }
      renderMessages(); renderList()
      addLog('wait', 'Mensaje eliminado por un cliente', `${c.name} · el original quedó guardado`)
      toast('El cliente borró un mensaje. Sigue visible en la bandeja.')
      break
    }
    case 'unlink':
      state.conn = 'qr'; state.qrLeft = 20; state.pairing = false
      addLog('off', 'Línea desvinculada', `Por ${ME} desde el panel`)
      renderConnect()
      break
    case 'reconnect':
      state.conn = 'connecting'; renderConnect()
      addLog('wait', 'Reconexión manual', `Pedida por ${ME}`)
      setTimeout(() => { state.conn = 'connected'; addLog('ok', 'Línea conectada', 'Sesión recuperada del servidor'); renderConnect() }, 1800)
      break
    case 'scan':
      state.conn = 'connecting'; renderConnect()
      setTimeout(() => {
        state.conn = 'connected'
        addLog('ok', 'Línea conectada', `Vinculada desde el celular de la agencia · ${LINE_PHONE}`)
        addLog('ok', 'Chats sincronizados', '37 chats · 1.204 mensajes')
        renderConnect()
        toast('WhatsApp vinculado.')
      }, 2200)
      break
    case 'pairing': state.pairing = true; renderConnect(); break
    case 'switch': {
      const on = t.getAttribute('aria-checked') !== 'true'
      t.setAttribute('aria-checked', on)
      toast(`${t.getAttribute('aria-label')}: ${on ? 'activado' : 'desactivado'}.`)
      break
    }
    case 'lb-close': $('#lightbox').hidden = true; break
  }
})

document.addEventListener('input', (e) => {
  if (e.target.id === 'search') { state.q = e.target.value; renderList() }
  if (e.target.id === 'msgInput') syncSendBtn()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'msgInput') { e.preventDefault(); sendText() }
  if (e.key === 'Escape') {
    if (!$('#lightbox').hidden) $('#lightbox').hidden = true
    else if (state.picker) { state.picker = false; renderComposer() }
    else $('#viewInbox').classList.remove('show-client')
  }
})
document.addEventListener('change', (e) => {
  if (e.target.id === 'assignSel') {
    const c = cur()
    c.assigned = e.target.value
    c.msgs.push({ type: 'sys', text: c.assigned ? `${ME} asignó el chat a ${c.assigned} · ${now()}` : `${ME} dejó el chat sin asignar · ${now()}` })
    renderMessages(); renderList()
    toast(c.assigned ? `Chat asignado a ${c.assigned}.` : 'Chat sin asignar.')
  }
  if (e.target.dataset.task) {
    cur().client.tasks[+e.target.dataset.task].done = e.target.checked
  }
  if (e.target.id === 'notesToggle') {
    document.body.classList.toggle('show-notes', e.target.checked)
    try { localStorage.setItem('wa-mock-notes', e.target.checked ? '1' : '0') } catch {}
  }
})
$('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') $('#lightbox').hidden = true })

/* ---------------- Inicio ---------------- */
try {
  const th = localStorage.getItem('wa-mock-theme')
  if (th) document.documentElement.dataset.theme = th
  if (localStorage.getItem('wa-mock-notes') === '1') {
    $('#notesToggle').checked = true
    document.body.classList.add('show-notes')
  }
} catch {}
syncThemeIcons()
renderList()
renderChat()
renderPill()
renderLog()
