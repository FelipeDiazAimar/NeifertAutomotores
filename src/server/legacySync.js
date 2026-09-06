import { createClient } from '@supabase/supabase-js'
import { createR2Client } from './r2Core.js'
import { createLegacyStore } from './legacyStore.js'
import { mirrorAllPhotos as realMirrorAllPhotos } from './legacyPhotos.js'
import { fetchAll as realFetchAll } from './legacyFetch.js'
import {
  transformUsuario, transformAlerta, transformTarea, transformCliente,
  transformVehiculo, transformPeritaje, transformGestoria, extractImagenes,
} from './legacyTransform.js'

export const ENTITY_PLAN = [
  { nombre: 'usuarios', tabla: 'usuarios', idOf: (r) => r.id, kind: 'usuario' },
  { nombre: 'clientes', tabla: 'clientes', idOf: (r) => r.id, kind: 'cliente' },
  { nombre: 'vehiculos', tabla: 'vehiculos', idOf: (r) => r.id, kind: 'vehiculo' },
  { nombre: 'peritaje', tabla: 'peritajes', idOf: (r) => r.id, kind: 'peritaje' },
  { nombre: 'gestoria', tabla: 'gestoria_tramites', idOf: (r) => r.id, kind: 'gestoria' },
  { nombre: 'alertas', tabla: 'alertas', idOf: (r) => r.id, kind: 'alerta' },
  { nombre: 'tareas', tabla: 'tareas', idOf: (r) => r.id, kind: 'tarea' },
  // jerarquia: solo raw, sin tabla normalizada todavia
]

function buildNormalized(kind, registros) {
  const rows = []
  const intereses = []
  const autosEntrega = []
  const parentIdsIntereses = []
  const parentIdsAE = []
  const vehiculosParaFotos = []

  for (const p of registros) {
    if (kind === 'usuario') rows.push(transformUsuario(p))
    else if (kind === 'alerta') rows.push(transformAlerta(p))
    else if (kind === 'tarea') rows.push(transformTarea(p))
    else if (kind === 'peritaje') rows.push(transformPeritaje(p))
    else if (kind === 'gestoria') rows.push(transformGestoria(p))
    else if (kind === 'cliente') {
      const { cliente, intereses: ints, autosEntrega: aes } = transformCliente(p)
      rows.push(cliente)
      parentIdsIntereses.push(cliente.id)
      parentIdsAE.push(cliente.id)
      for (const i of ints) intereses.push({ ...i, cliente_id: cliente.id })
      for (const a of aes) autosEntrega.push({ ...a, cliente_id: cliente.id })
    } else if (kind === 'vehiculo') {
      const { vehiculo } = transformVehiculo(p)
      rows.push(vehiculo)
      vehiculosParaFotos.push({ id: vehiculo.id, urls: extractImagenes(p) })
    }
  }
  return { rows, intereses, autosEntrega, parentIdsIntereses, parentIdsAE, vehiculosParaFotos }
}

export async function syncLegacyCrm(opts) {
  const {
    supabaseUrl, serviceRoleKey, crmUser, crmPass, r2 = {}, disparadoPor = 'cron', deps = {},
  } = opts
  const fetchAll = deps.fetchAll || realFetchAll
  const mirrorAllPhotos = deps.mirrorAllPhotos || realMirrorAllPhotos
  const makeSupabase = deps.makeSupabase || (() => createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }))
  const makeR2 = deps.makeR2 || (() => createR2Client({ accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey, endpoint: r2.endpoint }))
  const makeStore = deps.makeStore || ((sb) => createLegacyStore(sb))

  const supabase = makeSupabase()
  const store = makeStore(supabase)

  if (await store.anotherRunActive()) return { ok: false, skipped: 'otra-corrida' }

  const runId = await store.startRun(disparadoPor)
  const resumen = {}
  const errores = []
  let vehiculosParaFotos = []

  let fetched
  try {
    fetched = await fetchAll({ user: crmUser, pass: crmPass })
  } catch (e) {
    await store.finishRun(runId, { estado: 'error', error: `login/fetch: ${e.message}`, filasPorEntidad: {} })
    return { ok: false, estado: 'error', runId }
  }

  const { resultados } = fetched

  // jerarquia: solo raw
  if (resultados.jerarquia?.ok && resultados.jerarquia.registros.length) {
    try {
      const r = await store.writeRaw('jerarquia', resultados.jerarquia.registros, (x, i) => String(x.id ?? i), runId)
      resumen.jerarquia = r
    } catch (e) { errores.push(`jerarquia: ${e.message}`) }
  } else if (resultados.jerarquia && !resultados.jerarquia.ok) {
    errores.push(`jerarquia: ${resultados.jerarquia.error}`)
  }

  for (const plan of ENTITY_PLAN) {
    const res = resultados[plan.nombre]
    if (!res) continue
    if (!res.ok) { errores.push(`${plan.nombre}: ${res.error}`); continue }
    try {
      const registros = res.registros
      const raw = await store.writeRaw(plan.nombre, registros, plan.idOf, runId)
      const norm = buildNormalized(plan.kind, registros)
      await store.upsertRows(plan.tabla, norm.rows, 'id')

      if (plan.kind === 'cliente') {
        await store.replaceChildren('cliente_intereses', 'cliente_id', norm.parentIdsIntereses, norm.intereses)
        await store.replaceChildren('cliente_autos_entrega', 'cliente_id', norm.parentIdsAE, norm.autosEntrega)
      }
      if (plan.kind === 'vehiculo') vehiculosParaFotos = norm.vehiculosParaFotos

      await store.markRawSeen(plan.nombre, raw.ids)
      const borrados = await store.markDeleted(plan.tabla, norm.rows.map((r) => r.id), runId)
      resumen[plan.nombre] = { ...raw, upserts: norm.rows.length, borrados }
    } catch (e) {
      errores.push(`${plan.nombre}: ${e.message}`)
    }
  }

  let fotosBajadas = 0
  try {
    fotosBajadas = await mirrorAllPhotos({
      vehiculos: vehiculosParaFotos,
      fotosPorVehiculo: await store.fotosExistentes(vehiculosParaFotos.map((v) => v.id)),
      r2: makeR2(),
      bucket: r2.bucket,
      publicUrlBase: r2.publicUrlBase,
      upsertFotos: (filas) => store.upsertRows('vehiculo_fotos', filas, 'vehiculo_id,url_origen'),
    })
  } catch (e) {
    errores.push(`fotos: ${e.message}`)
  }

  const anyEndpointFailed = Object.values(resultados).some((r) => r && r.ok === false)
  const estado = anyEndpointFailed || errores.length ? 'error' : 'ok'
  await store.finishRun(runId, {
    estado,
    filasPorEntidad: resumen,
    fotosBajadas,
    error: errores.length ? errores.join(' | ') : null,
  })

  return { ok: estado === 'ok', estado, runId, resumen }
}
