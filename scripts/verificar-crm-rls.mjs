// Verifica las políticas RLS del módulo Vehículos contra el Supabase real.
// Uso: node --env-file=.env scripts/verificar-crm-rls.mjs
const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY

let fallos = 0
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!cond) fallos++
}

async function login(email, password) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error(`login ${email}: ${JSON.stringify(j)}`)
  return j.access_token
}

function rest(token, path, opts = {}) {
  return fetch(`${URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Profile': 'crm',
      'Accept-Profile': 'crm',
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...opts.headers,
    },
  })
}

const bruno = await login('bruno@crm-viejo.neifert.local', 'bruno321')

// 1) vendedor puede insertar
let r = await rest(bruno, 'vehiculos', {
  method: 'POST',
  body: JSON.stringify({ marca: 'TEST', modelo: 'RLS', moneda: 'ARS', estado: 'disponible' }),
})
ok(r.status === 201, `vendedor INSERT vehiculo → ${r.status} (esperado 201)`)
const creado = (await r.json())[0]

// 2) vendedor puede editar
r = await rest(bruno, `vehiculos?id=eq.${creado.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ nota: 'editado por test' }),
})
ok(r.status === 200, `vendedor PATCH vehiculo → ${r.status} (esperado 200)`)

// 3) vendedor puede archivar (update archivado_en)
r = await rest(bruno, `vehiculos?id=eq.${creado.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ archivado_en: new Date().toISOString() }),
})
ok(r.status === 200, `vendedor ARCHIVAR vehiculo → ${r.status} (esperado 200)`)

// 4) vendedor NO puede borrar — PostgREST devuelve 200 pero RLS oculta la fila,
//    así que la respuesta con return=representation trae 0 filas borradas.
r = await rest(bruno, `vehiculos?id=eq.${creado.id}`, { method: 'DELETE' })
const borradasVendedor = await r.json().catch(() => [])
ok(
  Array.isArray(borradasVendedor) && borradasVendedor.length === 0,
  `vendedor DELETE vehiculo → 0 filas borradas (RLS bloquea)`,
)

// 5) vendedor NO puede insertar en crm.usuarios
r = await rest(bruno, 'usuarios', {
  method: 'POST',
  body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000000', usuario: 'hack', nombre: 'x', rol: 'admin' }),
})
ok(r.status === 403 || r.status === 401, `vendedor INSERT usuario → ${r.status} (esperado 403)`)

// 6) admin sí puede borrar (limpieza)
const cristian = await login('cristian@crm-viejo.neifert.local', 'neifertcrm')
r = await rest(cristian, `vehiculos?id=eq.${creado.id}`, { method: 'DELETE' })
const borradasAdmin = await r.json().catch(() => [])
ok(
  Array.isArray(borradasAdmin) && borradasAdmin.length === 1,
  `admin DELETE vehiculo → 1 fila borrada (limpieza)`,
)

console.log(fallos === 0 ? '\nTodos los checks PASS' : `\n${fallos} FALLARON`)
process.exit(fallos === 0 ? 0 : 1)
