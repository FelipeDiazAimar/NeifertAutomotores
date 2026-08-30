// Pulls representative legacy payloads out of the captured HARs into
// src/server/__tests__/fixtures/legacy/. Run once: node scripts/extract-legacy-fixtures.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = resolve('src/server/__tests__/fixtures/legacy')
mkdirSync(OUT, { recursive: true })

const GET_HAR = resolve('scraping/Harfiles/neifert.har')
const WRITE_HAR = resolve('scraping/NewEndpoints/clientes.har')

const entidades = {
  clientes: 'clientes.php',
  vehiculos: 'vehiculos.php',
  peritaje: 'peritaje.php',
  gestoria: 'gestoria.php',
  alertas: 'alertas.php',
  tareas: 'tareas.php',
  usuarios: 'usuarios.php',
}

function bestBody(har, file) {
  let best = ''
  for (const e of har.log.entries) {
    let u
    try { u = new URL(e.request.url) } catch { continue }
    if (!u.pathname.endsWith('/backend/api/' + file)) continue
    if (e.request.method !== 'GET') continue
    const t = e.response?.content?.text || ''
    if (t.length > best.length) best = t
  }
  return best
}

function firstWrite(har, file, method) {
  for (const e of har.log.entries) {
    let u
    try { u = new URL(e.request.url) } catch { continue }
    if (!u.pathname.endsWith('/backend/api/' + file)) continue
    if (e.request.method !== method) continue
    const ct = (e.request.headers.find((h) => /content-type/i.test(h.name)) || {}).value || ''
    if (/multipart/.test(ct)) continue
    try { return JSON.parse(e.request.postData.text) } catch { return null }
  }
  return null
}

const getHar = JSON.parse(readFileSync(GET_HAR, 'utf8'))
const writeHar = JSON.parse(readFileSync(WRITE_HAR, 'utf8'))

for (const [name, file] of Object.entries(entidades)) {
  const raw = bestBody(getHar, file)
  let get = []
  try {
    const parsed = JSON.parse(raw)
    get = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : []
  } catch {}
  const out = { get: get.slice(0, 5) }
  const post = firstWrite(writeHar, file, 'POST')
  if (post) out.post = post
  const put = firstWrite(writeHar, file, 'PUT')
  if (put) out.put = put
  writeFileSync(resolve(OUT, name + '.json'), JSON.stringify(out, null, 2) + '\n')
  console.log(name, '→', out.get.length, 'get records', post ? '+post' : '', put ? '+put' : '')
}
