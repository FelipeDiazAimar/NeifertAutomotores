export function str(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

export function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function bool(v) {
  return v === true || v === 1 || v === '1'
}

export function dateOnly(v) {
  const s = str(v)
  if (!s || s.startsWith('0000-00-00')) return null
  return s.slice(0, 10)
}

export function transformUsuario(p) {
  return {
    id: num(p.id),
    usuario: str(p.user),
    nombre: str(p.nombre),
    rol: str(p.role) ?? '',
  }
}

export function transformAlerta(p) {
  return {
    id: str(p.id),
    tipo: str(p.tipo),
    titulo: str(p.titulo),
    descripcion: str(p.descripcion),
    fecha: dateOnly(p.fecha),
    hora: str(p.hora),
    done: bool(p.done),
    ref_id: str(p.ref_id ?? p.refId),
    ref_name: str(p.ref_name ?? p.refName),
    ref_phone: str(p.ref_phone ?? p.refPhone),
    creado_por: str(p.creado_por ?? p.creadoPor),
    asignado_a: str(p.asignado_a ?? p.asignadoA),
    created_at: str(p.created_at),
    updated_at: str(p.updated_at),
  }
}

export function transformTarea(p) {
  return {
    id: str(p.id),
    titulo: str(p.titulo),
    descripcion: str(p.descripcion),
    fecha: dateOnly(p.fecha),
    done: bool(p.done),
    cliente_id: str(p.cliente_id ?? p.clienteId),
    cliente_nombre: str(p.cliente_nombre ?? p.clienteNombre),
    cliente_phone: str(p.cliente_phone ?? p.clientePhone),
    asignado_a: str(p.asignado_a ?? p.asignadoA),
    created_at: str(p.created_at),
    updated_at: str(p.updated_at),
  }
}

export function parseMaybeJsonArray(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function mapInteres(b) {
  return { marca: str(b.marca ?? b.brand), modelo: str(b.modelo ?? b.model) }
}

function mapAutoEntrega(a) {
  return {
    marca: str(a.marca ?? a.brand),
    modelo: str(a.modelo ?? a.model),
    version: str(a.version),
    anio: num(a.anio ?? a.year),
    km: num(a.km),
    color: str(a.color),
    trans: str(a.trans),
    notas: str(a.notas ?? a.notes),
  }
}

export function transformCliente(p) {
  const cliente = {
    id: str(p.id),
    nombre: str(p.name ?? p.nombre),
    telefono: str(p.phone ?? p.telefono),
    localidad: str(p.localidad),
    fecha_cumple: dateOnly(p.fecha_cumple ?? p.fechaCumple),
    status: str(p.status),
    canal: str(p.canal),
    presupuesto: num(p.budget ?? p.presupuesto),
    marca_interes: str(p.brand),
    modelo_interes: str(p.model),
    tipo_interes: str(p.tipo),
    trans_interes: str(p.trans),
    anio_min: num(p.year_min ?? p.yearMin),
    anio_max: num(p.year_max ?? p.yearMax),
    notas: str(p.notes ?? p.notas),
    interes_cero_km: bool(p.interes_cero_km ?? p.interesCeroKm),
    cero_km: p.cero_km ?? p.ceroKm ?? null,
    tiene_auto_entrega: bool(p.tiene_auto_entrega ?? p.tieneAutoEntrega),
    creado_por: str(p.creado_por ?? p.creadoPor),
    editado_por: str(p.editado_por ?? p.editadoPor),
    fecha_creacion: dateOnly(p.fecha_creacion ?? p.fechaCreacion),
    fecha_edicion: dateOnly(p.fecha_edicion ?? p.fechaEdicion),
    created_at: str(p.created_at),
    updated_at: str(p.updated_at),
    venta_vehiculo_id: str(p.venta_car_id ?? p.ventaCarId),
    fecha_venta: dateOnly(p.fecha_venta ?? p.fechaVenta),
  }
  const brands = Array.isArray(p.brands) ? p.brands : []
  const intereses = brands.map(mapInteres)
  const aeSource =
    (Array.isArray(p.autosEntrega) && p.autosEntrega.length ? p.autosEntrega : null) ??
    parseMaybeJsonArray(p.autos_entrega)
  const autosEntrega = aeSource.map(mapAutoEntrega)
  return { cliente, intereses, autosEntrega }
}
