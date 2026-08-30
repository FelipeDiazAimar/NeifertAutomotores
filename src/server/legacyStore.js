import { payloadHash } from './legacyHash.js'

export function listOf(ids) {
  if (!ids || ids.length === 0) return '("__none__")'
  return '(' + ids.map((v) => (typeof v === 'number' ? String(v) : `"${String(v).replace(/"/g, '')}"`)).join(',') + ')'
}

const STALE_RUN_MIN = 30

export function createLegacyStore(supabase) {
  const db = () => supabase.schema('crm_legacy')

  async function anotherRunActive() {
    const cutoff = new Date(Date.now() - STALE_RUN_MIN * 60_000).toISOString()
    const { data, error } = await db()
      .from('sync_runs')
      .select('id')
      .eq('estado', 'corriendo')
      .gt('iniciado_en', cutoff)
      .limit(1)
    if (error) throw error
    return (data?.length ?? 0) > 0
  }

  async function startRun(disparadoPor) {
    const { data, error } = await db()
      .from('sync_runs')
      .insert({ disparado_por: disparadoPor })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  }

  async function finishRun(id, { estado, filasPorEntidad, fotosBajadas, error }) {
    const { error: err } = await db()
      .from('sync_runs')
      .update({
        terminado_en: new Date().toISOString(),
        estado,
        filas_por_entidad: filasPorEntidad ?? {},
        fotos_bajadas: fotosBajadas ?? 0,
        error: error ?? null,
      })
      .eq('id', id)
    if (err) throw err
  }

  async function writeRaw(entidad, registros, idOf, runId) {
    const rows = registros.map((r) => {
      const idLegacy = String(idOf(r))
      return { entidad, id_legacy: idLegacy, payload: r, hash: payloadHash(r), sync_run_id: runId }
    })
    let nuevos = 0
    if (rows.length) {
      const { data, error } = await db()
        .from('raw_registros')
        .upsert(rows, { onConflict: 'entidad,id_legacy,hash', ignoreDuplicates: true })
        .select('id_legacy')
      if (error) throw error
      nuevos = data?.length ?? 0
    }
    return { leidos: registros.length, nuevos, ids: rows.map((r) => r.id_legacy) }
  }

  async function markRawSeen(entidad, ids) {
    const { error: e1 } = await db()
      .from('raw_registros')
      .update({ visto_ultimo_sync: true })
      .eq('entidad', entidad)
      .in('id_legacy', ids.length ? ids : ['__none__'])
    if (e1) throw e1
    const { error: e2 } = await db()
      .from('raw_registros')
      .update({ visto_ultimo_sync: false })
      .eq('entidad', entidad)
      .not('id_legacy', 'in', listOf(ids))
    if (e2) throw e2
  }

  async function upsertRows(tabla, rows, onConflict = 'id') {
    if (!rows.length) return
    const { error } = await db().from(tabla).upsert(rows, { onConflict })
    if (error) throw error
  }

  async function replaceChildren(tabla, parentCol, parentIds, rows) {
    if (parentIds.length) {
      const { error } = await db().from(tabla).delete().in(parentCol, parentIds)
      if (error) throw error
    }
    if (rows.length) {
      const { error } = await db().from(tabla).insert(rows)
      if (error) throw error
    }
  }

  async function markDeleted(tabla, idsVivos, runId) {
    const { data, error } = await db()
      .from(tabla)
      .update({ borrado_en: new Date().toISOString(), sync_run_id: runId })
      .is('borrado_en', null)
      .not('id', 'in', listOf(idsVivos))
      .select('id')
    if (error) throw error
    return data?.length ?? 0
  }

  async function fotosExistentes(vehiculoIds) {
    const map = new Map()
    if (!vehiculoIds.length) return map
    const { data, error } = await db()
      .from('vehiculo_fotos')
      .select('vehiculo_id, url_origen, url_espejo')
      .in('vehiculo_id', vehiculoIds)
    if (error) throw error
    for (const row of data || []) {
      if (!map.has(row.vehiculo_id)) map.set(row.vehiculo_id, [])
      map.get(row.vehiculo_id).push(row)
    }
    return map
  }

  return {
    anotherRunActive, startRun, finishRun,
    writeRaw, markRawSeen, upsertRows, replaceChildren, markDeleted, fotosExistentes,
  }
}
