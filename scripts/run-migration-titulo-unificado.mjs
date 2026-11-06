import pg from 'pg'
import { readFileSync } from 'node:fs'

const files = [
  'supabase/crm_gestoria_fotos.sql',
  'supabase/crm_gestoria_fotos_titulo_unificado.sql',
]
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
for (const f of files) {
  await client.query(readFileSync(f, 'utf8'))
  console.log('OK', f)
}
const r = await client.query(
  'select slot, count(*) n from crm.gestoria_fotos group by 1 order by 1'
)
console.log(JSON.stringify(r.rows))
await client.end()
