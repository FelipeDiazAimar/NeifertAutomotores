// Migra crm_legacy.clientes -> crm. Uso: node --env-file=.env scripts/migrate-clientes-to-crm.mjs
import { readFileSync } from 'node:fs'
import pg from 'pg'

const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
await c.query(readFileSync('supabase/crm_clientes_migracion.sql', 'utf8')) // crea/actualiza la función
const r = await c.query('select * from crm.migrar_clientes_desde_legacy()')
console.log(JSON.stringify(r.rows))
await c.end()
