// Diagnóstico: muestra los cambios de estado recientes (solo lectura).
// Uso: node --env-file=.env scripts/revertir-estado-vehiculos.mjs [--ejecutar]
import { createClient } from '@supabase/supabase-js'

const EJECUTAR = process.argv.includes('--ejecutar')

const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// 1. Últimos eventos de cambio de estado (lote accidental de hoy)
const { data: eventos, error } = await admin
  .schema('crm')
  .from('eventos')
  .select('id, entidad_id, tipo, datos, usuario_id, creado_en')
  .eq('entidad', 'vehiculo')
  .eq('tipo', 'cambio_estado')
  .order('creado_en', { ascending: false })
  .limit(40)

if (error) throw error

console.log(`\n=== Últimos ${eventos.length} cambios de estado ===`)
for (const e of eventos) {
  console.log(`${e.creado_en} | veh=${e.entidad_id} | ${e.datos?.de} → ${e.datos?.a} | user=${e.usuario_id}`)
}

// 2. Agrupar por minuto para detectar el lote accidental
const porMinuto = {}
for (const e of eventos) {
  const min = String(e.creado_en).slice(0, 16)
  porMinuto[min] = porMinuto[min] ?? []
  porMinuto[min].push(e)
}
console.log('\n=== Lotes por minuto ===')
for (const [min, lote] of Object.entries(porMinuto)) {
  console.log(`${min} → ${lote.length} cambios`)
}

if (!EJECUTAR) {
  console.log('\n(Solo lectura. Para revertir, avisame y lo ejecuto con --ejecutar)')
  process.exit(0)
}

// 3. Revertir: solo el lote más reciente si todos van al mismo estado
const minutos = Object.keys(porMinuto).sort().reverse()
const lote = porMinuto[minutos[0]]
console.log(`\n=== Revirtiendo lote ${minutos[0]} (${lote.length} vehículos) ===`)
let ok = 0
for (const e of lote) {
  const anterior = e.datos?.de
  if (!anterior) {
    console.log(`veh=${e.entidad_id}: SIN estado anterior registrado, se omite`)
    continue
  }
  // Traer nombre + estado actual para no pisar cambios posteriores
  const { data: v } = await admin.schema('crm').from('vehiculos').select('marca, modelo, estado').eq('id', e.entidad_id).single()
  const nombre = v ? `${v.marca} ${v.modelo}` : e.entidad_id
  if (!v) {
    console.log(`${nombre}: no existe, se omite`)
    continue
  }
  if (v.estado !== e.datos?.a) {
    console.log(`${nombre}: estado actual '${v.estado}' ≠ '${e.datos?.a}' (alguien lo tocó después), se omite`)
    continue
  }
  if (v.estado === anterior) {
    console.log(`${nombre}: ya está en '${anterior}', sin cambios`)
    continue
  }
  const { error: upErr } = await admin.schema('crm').from('vehiculos').update({ estado: anterior }).eq('id', e.entidad_id)
  if (upErr) {
    console.log(`${nombre}: ERROR ${upErr.message}`)
    continue
  }
  await admin.schema('crm').from('eventos').insert({
    entidad: 'vehiculo',
    entidad_id: String(e.entidad_id),
    tipo: 'cambio_estado',
    datos: { de: e.datos?.a, a: anterior, reversion_de: e.id },
    usuario_id: e.usuario_id,
  })
  console.log(`${nombre}: ${e.datos?.a} → ${anterior} OK`)
  ok++
}
console.log(`\nRevertidos: ${ok}/${lote.length}`)
