import { supabase } from '@/services/supabaseClient'
import { resumenPeritaje, estadoPeritaje } from '@/crm/lib/peritajeSchema'
import { registrar } from './eventos.service.js'

const db = () => supabase.schema('crm')

/** Para la sección dedicada: TODOS los vehículos no archivados con su peritaje
 *  más reciente y el estado derivado (sin_iniciar / en_proceso / completo).
 *  `estado` filtra por ese estado; `busqueda` matchea marca/modelo/patente. */
export async function listarVehiculos({ busqueda = '', estado } = {}) {
  const { data, error } = await db()
    .from('vehiculos')
    .select(
      'id, marca, modelo, patente, estado, ' +
        'peritajes(id, fecha, costo_total, items_ok, items_obs, items_falta, ' +
        'peritado_por_nombre, peritador:usuarios(nombre))',
    )
    .is('archivado_en', null)
    .order('marca', { ascending: true })
    .order('fecha', { referencedTable: 'peritajes', ascending: false })
  if (error) throw error

  let filas = (data ?? []).map((v) => {
    const ultimo = v.peritajes?.[0] ?? null
    return {
      vehiculo: { id: v.id, marca: v.marca, modelo: v.modelo, patente: v.patente, estado: v.estado },
      peritaje: ultimo,
      cantidad: v.peritajes?.length ?? 0,
      estadoPeritaje: estadoPeritaje(ultimo),
    }
  })

  if (estado) filas = filas.filter((f) => f.estadoPeritaje === estado)
  const b = busqueda.trim().toLowerCase()
  if (b) {
    filas = filas.filter((f) =>
      `${f.vehiculo.marca ?? ''} ${f.vehiculo.modelo ?? ''} ${f.vehiculo.patente ?? ''}`
        .toLowerCase()
        .includes(b),
    )
  }
  return filas
}

export async function listarPorVehiculo(vehiculoId) {
  const { data, error } = await db()
    .from('peritajes')
    .select(
      'id, fecha, costo_total, items_ok, items_obs, items_falta, resena, ' +
        'peritado_por, peritado_por_nombre, peritador:usuarios(nombre)',
    )
    .eq('vehiculo_id', vehiculoId)
    .order('fecha', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function obtener(id) {
  const { data, error } = await db()
    .from('peritajes')
    .select('*, peritador:usuarios(nombre)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function crear({ vehiculoId, datos, fecha, resena, costo_total, peritadoPor }) {
  const r = resumenPeritaje(datos)
  const { data, error } = await db()
    .from('peritajes')
    .insert({
      vehiculo_id: vehiculoId,
      datos,
      fecha: fecha || null,
      resena: resena || null,
      costo_total: costo_total ?? null,
      peritado_por: peritadoPor ?? null,
      ...r,
    })
    .select()
  if (error) throw error
  await registrar({
    entidad: 'vehiculo', entidadId: vehiculoId, tipo: 'peritaje',
    datos: { peritaje_id: data[0].id, resumen: r }, usuarioId: peritadoPor,
  })
  return data[0]
}

export async function actualizar(id, { vehiculoId, datos, fecha, resena, costo_total, peritadoPor }) {
  const r = resumenPeritaje(datos)
  const { data, error } = await db()
    .from('peritajes')
    .update({ datos, fecha: fecha || null, resena: resena || null, costo_total: costo_total ?? null, ...r })
    .eq('id', id)
    .select()
  if (error) throw error
  await registrar({
    entidad: 'vehiculo', entidadId: vehiculoId, tipo: 'peritaje',
    datos: { peritaje_id: id, resumen: r, editado: true }, usuarioId: peritadoPor,
  })
  return data[0]
}
