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
