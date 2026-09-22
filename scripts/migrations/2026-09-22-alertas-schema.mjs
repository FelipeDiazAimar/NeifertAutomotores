import pg from 'pg'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../../supabase/crm_alertas_schema.sql', import.meta.url), 'utf8')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
await client.query(sql)
await client.end()
console.log('Schema de alertas aplicado.')
