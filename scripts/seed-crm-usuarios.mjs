// Lee scripts/crm-usuarios.local.json (gitignored) y siembra los usuarios del
// CRM nuevo. Uso: node --env-file=.env scripts/seed-crm-usuarios.mjs
//
// Formato de scripts/crm-usuarios.local.json:
// [
//   { "usuario": "Cristian", "nombre": "Cristian", "rol": "admin",    "password": "…" },
//   { "usuario": "Bruno",    "nombre": "Bruno",    "rol": "vendedor", "password": "…" }
// ]
import { readFileSync } from 'node:fs'
import { handleSeedUsuarios } from '../api/crm/seed-usuarios.js'

const usuarios = JSON.parse(readFileSync(new URL('./crm-usuarios.local.json', import.meta.url), 'utf8'))
const secret = process.env.SEED_SECRET || process.env.CRON_SECRET

const res = {
  statusCode: 0, body: null,
  setHeader() {},
  status(c) { this.statusCode = c; return this },
  json(b) { this.body = b; return this },
  end(b) { this.body = b ?? this.body; return this },
}

await handleSeedUsuarios(
  { method: 'POST', headers: { authorization: 'Bearer ' + secret }, body: { usuarios } },
  res,
  {},
)

console.log(JSON.stringify(res.body, null, 2))
process.exit(res.statusCode === 200 ? 0 : 1)
