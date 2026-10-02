import pg from 'pg'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('./migrations/2026-09-13d-fix-vendedor-vistas.sql', import.meta.url), 'utf8')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
await client.query(sql)
await client.end()
console.log('Migración aplicada.')
