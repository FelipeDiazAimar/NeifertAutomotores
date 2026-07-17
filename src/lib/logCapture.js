/** Captura de logs para depurar desde el teléfono sin herramientas externas.
 *  Intercepta console.log/info/warn/error y los errores no atrapados de la
 *  ventana, los guarda en un buffer con tope y los persiste en localStorage
 *  para que sobrevivan a recargas y navegación. La vista /admin/logerrors los
 *  muestra, copia y limpia. Es liviano (solo empuja strings a un array). */

const STORAGE_KEY = 'nf-logs'
const MAX_ENTRIES = 400

let entries = []
const listeners = new Set()
let initialized = false

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    entries = raw ? JSON.parse(raw) : []
  } catch {
    entries = []
  }
}

let saveTimer = null
function persist() {
  // Debounce: no escribir localStorage en cada log (puede haber ráfagas).
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    } catch {
      // Si se llena la cuota, recorta a la mitad y reintenta una vez.
      entries = entries.slice(-Math.floor(MAX_ENTRIES / 2))
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
      } catch {
        /* se ignora */
      }
    }
  }, 400)
}

function emit() {
  for (const cb of listeners) cb(entries)
}

/** Convierte un argumento cualquiera de console.* en texto legible. */
function stringifyArg(arg) {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}${arg.stack ? '\n' + arg.stack : ''}`
  if (typeof arg === 'string') return arg
  if (typeof arg === 'undefined') return 'undefined'
  try {
    return JSON.stringify(arg, replacerWithCircular(), 2)
  } catch {
    return String(arg)
  }
}

/** Reemplazo para JSON.stringify que tolera referencias circulares. */
function replacerWithCircular() {
  const seen = new WeakSet()
  return (_key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]'
      seen.add(value)
    }
    return value
  }
}

function record(level, args) {
  const message = Array.from(args).map(stringifyArg).join(' ')
  // Se guarda la ruta actual: un "Load failed" suelto sin esto es imposible
  // de ubicar (¿pasó en /admin/catalogo? ¿en /admin/contenido?).
  const path = typeof window !== 'undefined' ? window.location.pathname : ''
  entries.push({ ts: Date.now(), level, message, path })
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES)
  persist()
  emit()
}

/** Arranca la captura. Idempotente: se puede llamar más de una vez. */
export function initLogCapture() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  load()

  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = console[level].bind(console)
    console[level] = (...args) => {
      try {
        record(level, args)
      } catch {
        /* nunca romper el console real */
      }
      original(...args)
    }
  }

  window.addEventListener('error', (e) => {
    // e.error tiene stack; si no, se arma con message + archivo:línea.
    const detail = e.error
      ? stringifyArg(e.error)
      : `${e.message} (${e.filename || '?'}:${e.lineno || '?'}:${e.colno || '?'})`
    record('error', [`[window.onerror] ${detail}`])
  })

  window.addEventListener('unhandledrejection', (e) => {
    record('error', [`[unhandledrejection] ${stringifyArg(e.reason)}`])
  })

  // Backgrounding/descarga de la pestaña (típico al abrir el selector nativo
  // de fotos en iOS): ayuda a distinguir "se recargó la página" de "hay un
  // bug real en el código" cuando falta un tramo de logs esperado.
  document.addEventListener('visibilitychange', () => {
    record('info', [`[visibility] ${document.visibilityState}`])
  })
  window.addEventListener('pagehide', (e) => {
    record('info', [`[pagehide] persisted=${e.persisted}`])
  })
  window.addEventListener('pageshow', (e) => {
    record('info', [`[pageshow] persisted=${e.persisted}`])
  })

  record('info', ['[logCapture] captura de logs iniciada'])
}

export function getLogs() {
  return entries
}

export function clearLogs() {
  entries = []
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* se ignora */
  }
  emit()
}

/** Se suscribe a cambios; devuelve la función para desuscribirse. */
export function subscribeLogs(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Todos los logs como texto plano (para copiar/pegar). */
export function logsAsText() {
  return entries
    .map((e) => `${new Date(e.ts).toISOString()} [${e.level.toUpperCase()}]${e.path ? ` (${e.path})` : ''} ${e.message}`)
    .join('\n')
}
