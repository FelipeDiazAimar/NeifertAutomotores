import { supabase } from '@/services/supabaseClient'

const db = () => supabase.schema('crm')

/** Campos del alta de vehiculos que funcionan como select escribible. */
export const CAMPOS = ['marca', 'modelo', 'version', 'tipo', 'color', 'origen', 'tipo_consignacion']

const norm = (v) => (typeof v === 'string' ? v.trim() : '')

/** Une listas de strings, descarta vacios, dedup sin distinguir mayusculas y
 *  ordena alfabeticamente (es). Conserva la primera grafia vista. */
function fusionar(...listas) {
  const vistos = new Map()
  for (const lista of listas) {
    for (const v of lista) {
      const t = norm(v)
      if (!t) continue
      const k = t.toLowerCase()
      if (!vistos.has(k)) vistos.set(k, t)
    }
  }
  return [...vistos.values()].sort((a, b) =>
    a.localeCompare(b, 'es', { sensitivity: 'base' }),
  )
}

/** { marca:[...], modelo:[...], ... } — union de los valores ya presentes en
 *  crm.vehiculos y del catalogo crm.opciones_campo. Si el catalogo todavia no
 *  existe (schema sin migrar) se usa solo lo derivado de los vehiculos. */
export async function listar() {
  const [vehRes, catRes] = await Promise.all([
    db().from('vehiculos').select(CAMPOS.join(',')).is('archivado_en', null),
    db().from('opciones_campo').select('campo,valor'),
  ])
  if (vehRes.error) throw vehRes.error
  const catFilas = catRes.error ? [] : catRes.data ?? []

  const out = {}
  for (const campo of CAMPOS) {
    const deVeh = (vehRes.data ?? []).map((f) => f[campo])
    const deCat = catFilas.filter((r) => r.campo === campo).map((r) => r.valor)
    out[campo] = fusionar(deVeh, deCat)
  }
  return out
}

/** Guarda en el catalogo los valores nuevos que el usuario tipeo.
 *  `entradas`: [{ campo, valor }]. Ignora duplicados y cualquier error
 *  (p. ej. tabla ausente) para no romper el guardado del vehiculo. */
export async function registrar(entradas = []) {
  const filas = entradas
    .filter((e) => CAMPOS.includes(e?.campo) && norm(e?.valor))
    .map((e) => ({ campo: e.campo, valor: norm(e.valor) }))
  if (!filas.length) return
  try {
    const { error } = await db()
      .from('opciones_campo')
      .upsert(filas, { onConflict: 'campo,valor', ignoreDuplicates: true })
    if (error) throw error
  } catch (e) {
    if (import.meta.env?.DEV) {
      console.warn('[crm] no se pudieron guardar opciones nuevas:', e.message)
    }
  }
}
