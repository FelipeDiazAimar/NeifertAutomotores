import { supabase } from '@/services/supabaseClient'
import { registrar } from './eventos.service.js'

const db = () => supabase.schema('crm')

/** Todos los vehículos (salvo baja) con su gestoría, ordenados por marca A-Z.
 *  Los que aún no tienen fila en `gestoria` se devuelven con estado
 *  'sin_iniciar' para que la sección muestre el stock completo.
 *  `estado` filtra por sin_iniciar / en_proceso / completo. */
export async function listarTodas({ estado } = {}) {
  const { data, error } = await db()
    .from('vehiculos')
    .select(
      'id, marca, modelo, patente, estado, tipo, fotos:vehiculo_fotos(url,es_portada), gestoria(*)',
    )
    .neq('estado', 'baja')
    .order('marca', { ascending: true })
    .order('modelo', { ascending: true })
  if (error) throw error

  let filas = (data ?? []).map((v) => {
    const raw = v.gestoria
    const g = Array.isArray(raw) ? raw[0] ?? null : raw ?? null
    const vehiculo = {
      id: v.id, marca: v.marca, modelo: v.modelo, patente: v.patente,
      estado: v.estado, tipo: v.tipo, fotos: v.fotos,
    }
    if (g) return { ...g, vehiculo }
    return { id: `sin-${v.id}`, vehiculo_id: v.id, estado: 'sin_iniciar', actualizado_en: null, vehiculo }
  })

  if (estado) filas = filas.filter((g) => g.estado === estado)
  return filas
}

export async function obtenerPorVehiculo(vehiculoId) {
  const { data, error } = await db()
    .from('gestoria')
    .select('*')
    .eq('vehiculo_id', vehiculoId)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Upsert parcial de la fila de gestoría (1-1 por vehículo). El trigger de la
 *  DB recalcula `estado`. */
export async function guardarCampos(vehiculoId, parche, autorId) {
  const { error } = await db()
    .from('gestoria')
    .upsert({ vehiculo_id: vehiculoId, ...parche }, { onConflict: 'vehiculo_id' })
  if (error) throw error
  await registrar({
    entidad: 'vehiculo', entidadId: vehiculoId, tipo: 'gestoria',
    datos: { campos: Object.keys(parche) }, usuarioId: autorId,
  })
}
