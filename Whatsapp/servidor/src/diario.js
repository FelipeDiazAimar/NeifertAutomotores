/*
 * Diario local (write-ahead log) de lo que todavía no llegó a Supabase.
 *
 * Los cambios se escriben en Supabase en tandas (nube.js, cada 1,5 s). Si el proceso
 * muere justo en ese lapso (un corte de luz, un kill, Windows Update), lo de la tanda se
 * perdería. Por eso cada mensaje y cada chat que cambia se anota ANTES acá, en el disco:
 *
 *   data/diario/actual.jsonl       lo que se va anotando
 *   data/diario/tramo-<ts>.jsonl   lo que tomó una tanda y todavía no confirmó Supabase
 *
 * Cuando una tanda arranca, el diario actual se cierra como tramo; cuando Supabase confirma,
 * ese tramo (y los anteriores) se borran. Al arrancar, lo que haya quedado en el diario se
 * vuelve a cargar y a mandar: el resultado es el mismo aunque se repita (las escrituras
 * pisan por id).
 *
 * Los mensajes que llegan en vivo se escriben y se fuerzan al disco en el momento
 * (fdatasync): ni un corte de luz los pierde. Los del historial (miles de golpe) se fuerzan
 * cada 200 ms, para no frenar la sincronización: un kill no los pierde nunca (el sistema
 * ya los tiene); un corte de luz, como mucho lo de ese instante, que WhatsApp vuelve a
 * mandar con el historial.
 */
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from './config.js'

const DIR = path.join(DATA_DIR, 'diario')
const ACTUAL = path.join(DIR, 'actual.jsonl')
const tsDeTramo = (f) => Number(/^tramo-(\d+)/.exec(f)?.[1] || 0)

let fd = null
let syncTimer = null

function abrir() {
  fs.mkdirSync(DIR, { recursive: true })
  fd = fs.openSync(ACTUAL, 'a')
}

function sincronizar() {
  syncTimer = null
  try {
    if (fd !== null) fs.fdatasyncSync(fd)
  } catch {}
}

/**
 * Anota una entrada: { jid, m } (mensaje completo), { jid, id, borrar: true } o
 * { chat: jid, c } (estado del chat). Con `urgente`, se fuerza al disco ya.
 */
export function anotar(entrada, { urgente = false } = {}) {
  if (fd === null) abrir()
  fs.writeSync(fd, `${JSON.stringify(entrada)}\n`)
  if (urgente) {
    clearTimeout(syncTimer)
    sincronizar()
  } else if (!syncTimer) {
    syncTimer = setTimeout(sincronizar, 200)
  }
}

/** Cierra lo anotado hasta ahora como un tramo (lo que va a escribir la tanda). null si no hay nada. */
export function cerrarTramo() {
  if (fd === null) return null
  clearTimeout(syncTimer)
  sincronizar()
  const vacio = fs.fstatSync(fd).size === 0
  fs.closeSync(fd)
  fd = null
  if (vacio) return null
  const tramo = path.join(DIR, `tramo-${Date.now()}.jsonl`)
  fs.renameSync(ACTUAL, tramo)
  return tramo
}

/** Supabase confirmó la tanda: se borran ese tramo y los anteriores (ya quedaron incluidos). */
export function tramoGuardado(tramo) {
  if (!tramo) return
  const hasta = tsDeTramo(path.basename(tramo))
  for (const f of fs.readdirSync(DIR)) {
    if (f.startsWith('tramo-') && tsDeTramo(f) <= hasta) fs.rmSync(path.join(DIR, f), { force: true })
  }
}

/**
 * Al arrancar: todo lo que quedó sin confirmar, en orden. El diario actual pasa a ser un
 * tramo más, así se borra con la primera tanda que confirme Supabase.
 */
export function recuperar() {
  if (!fs.existsSync(DIR)) return []
  if (fs.existsSync(ACTUAL) && fs.statSync(ACTUAL).size > 0) {
    fs.renameSync(ACTUAL, path.join(DIR, `tramo-${Date.now()}.jsonl`))
  }
  const entradas = []
  const tramos = fs.readdirSync(DIR).filter((f) => f.startsWith('tramo-')).sort((a, b) => tsDeTramo(a) - tsDeTramo(b))
  for (const f of tramos) {
    for (const linea of fs.readFileSync(path.join(DIR, f), 'utf8').split('\n')) {
      if (!linea.trim()) continue
      try {
        entradas.push(JSON.parse(linea))
      } catch {
        // Última línea a medio escribir por un corte: se ignora (era lo último, no se confirmó).
      }
    }
  }
  return entradas
}

/** Cuántas entradas hay sin confirmar (para el panel de espacio usado). */
export function pendientesEnDiario() {
  if (!fs.existsSync(DIR)) return 0
  let n = 0
  for (const f of fs.readdirSync(DIR)) {
    try {
      n += fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').filter((l) => l.trim()).length
    } catch {}
  }
  return n
}
