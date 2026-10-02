// Respaldo de crm.{clientes,vehiculos,gestoria,peritajes} antes de re-correr
// la migración legacy->crm, por si hace falta comparar o revertir algo.
// Uso: node --env-file=.env scripts/backup-crm-before-resync.mjs
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'

const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const tablas = ['clientes', 'vehiculos', 'gestoria', 'peritajes']
const backup = {}
for (const t of tablas) {
  const { data, error } = await admin.schema('crm').from(t).select('*')
  if (error) {
    console.error(`leer crm.${t}:`, error.message)
    process.exit(1)
  }
  backup[t] = data
  console.log(`crm.${t}: ${data.length} filas`)
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const path = new URL(`./backup-crm-${stamp}.json`, import.meta.url)
writeFileSync(path, JSON.stringify(backup, null, 2))
console.log('Backup guardado en', path.pathname)
