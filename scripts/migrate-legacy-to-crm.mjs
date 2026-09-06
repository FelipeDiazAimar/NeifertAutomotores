// Migra crm_legacy -> crm. Uso: node --env-file=.env scripts/migrate-legacy-to-crm.mjs
// Requiere: crm_schema.sql + crm_migracion.sql aplicados, crm_legacy poblado,
// y los usuarios seedeados (scripts/seed-crm-usuarios.mjs).
import { createClient } from '@supabase/supabase-js'
import { resumenPeritaje } from '../src/crm/lib/mapeos.js'

const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// 1) vehículos + gestoría (función SQL)
const { data: sqlRes, error: rpcErr } = await admin.schema('crm').rpc('migrar_desde_legacy')
if (rpcErr) {
  console.error('migrar_desde_legacy():', rpcErr.message)
  process.exit(1)
}
console.log('SQL:', JSON.stringify(sqlRes))

// 2) peritajes (JS — el resumen se calcula acá)
const { data: legacyPer, error: perErr } = await admin.schema('crm_legacy').from('peritajes').select('*')
if (perErr) {
  console.error('leer crm_legacy.peritajes:', perErr.message)
  process.exit(1)
}
const { data: vehs } = await admin.schema('crm').from('vehiculos').select('id, id_legacy')
const porLegacy = new Map((vehs ?? []).map((v) => [v.id_legacy, v.id]))

let ok = 0
let sinVehiculo = 0
for (const p of legacyPer ?? []) {
  const vehiculo_id = porLegacy.get(p.vehiculo_id)
  if (!vehiculo_id) {
    sinVehiculo++
    continue
  }
  const datos = p.secciones ?? {}
  const r = resumenPeritaje(datos)
  const { error } = await admin.schema('crm').from('peritajes').upsert(
    {
      id_legacy: p.id,
      vehiculo_id,
      fecha: p.fecha_peritaje ?? null,
      peritado_por_nombre: p.peritado_por ?? null,
      resena: p.resena_texto ?? null,
      costo_total: p.costo_total ?? null,
      datos,
      ...r,
    },
    { onConflict: 'id_legacy' },
  )
  if (error) console.error('peritaje', p.id, error.message)
  else ok++
}

// 3) conteos finales
for (const t of ['usuarios', 'vehiculos', 'gestoria', 'peritajes']) {
  const { count } = await admin.schema('crm').from(t).select('*', { count: 'exact', head: true })
  console.log(`crm.${t} =`, count)
}
console.log('peritajes migrados (JS):', ok, '| sin vehículo match:', sinVehiculo)
