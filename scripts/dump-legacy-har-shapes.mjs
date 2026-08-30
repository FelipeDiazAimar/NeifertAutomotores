// Recorre los HARs capturados e imprime, por `METODO /path`, un ejemplo de
// request body y uno de response body (JSON pretty; multipart se anota).
// Uso: node scripts/dump-legacy-har-shapes.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const DIRS = ['scraping/Harfiles', 'scraping/NewEndpoints']
const seen = new Map()

function pretty(txt) {
  if (!txt) return '(vacío)'
  try {
    return JSON.stringify(JSON.parse(txt), null, 2)
  } catch {
    return txt.slice(0, 600)
  }
}

for (const dir of DIRS) {
  let files
  try {
    files = readdirSync(resolve(dir)).filter((f) => f.endsWith('.har'))
  } catch {
    continue
  }
  for (const file of files) {
    let har
    try {
      har = JSON.parse(readFileSync(resolve(dir, file), 'utf8'))
    } catch {
      continue
    }
    for (const e of har.log.entries) {
      let u
      try {
        u = new URL(e.request.url)
      } catch {
        continue
      }
      if (!/\/backend\/api\//.test(u.pathname)) continue
      if (e.request.method === 'OPTIONS') continue
      const key = `${e.request.method} ${u.pathname}`
      if (seen.has(key)) continue
      const ct = (e.request.headers.find((h) => /content-type/i.test(h.name)) || {}).value || ''
      const reqBody = /multipart/.test(ct)
        ? `(multipart/form-data — ${ct})`
        : pretty(e.request.postData?.text || '')
      const resBody = pretty(e.response?.content?.text || '')
      seen.set(key, { status: e.response?.status, query: u.search, reqBody, resBody })
    }
  }
}

for (const [key, v] of [...seen.entries()].sort()) {
  console.log('\n\n########## ' + key + (v.query || '') + '  [' + v.status + '] ##########')
  console.log('--- REQUEST ---\n' + v.reqBody)
  console.log('--- RESPONSE ---\n' + v.resBody)
}
