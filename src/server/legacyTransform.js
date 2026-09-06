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

export function extractImagenes(p) {
  const arr = p.imagenes ?? p.fotos ?? p.images ?? []
  if (!Array.isArray(arr)) return []
  return arr
    .map((it) => (typeof it === 'string' ? it : it && (it.url ?? it.src ?? it.href)))
    .filter((u) => typeof u === 'string' && u.length > 0)
}

export function transformVehiculo(p) {
  const vehiculo = {
    id: str(p.id),
    marca: str(p.brand ?? p.marca),
    modelo: str(p.model ?? p.modelo),
    version: str(p.version),
    patente: str(p.patente),
    tipo: str(p.tipo),
    anio: num(p.year ?? p.anio),
    km: num(p.km),
    trans: str(p.trans),
    color: str(p.color),
    moneda_contado: str(p.moneda_contado ?? p.monedaContado),
    precio_contado: num(p.precio_contado ?? p.precioContado),
    moneda_canje: str(p.moneda_canje ?? p.monedaCanje),
    precio_canje: num(p.precio_canje ?? p.precioCanje),
    duenio_nombre: str(p.duenio_nombre ?? p.duenioNombre),
    duenio_apellido: str(p.duenio_apellido ?? p.duenioApellido),
    duenio_contacto: str(p.duenio_contacto ?? p.duenioContacto),
    itv: str(p.itv),
    itv_venc: dateOnly(p.itv_venc ?? p.itvVenc),
    consignacion: bool(p.consignacion),
    tipo_consignacion: str(p.tipo_consignacion ?? p.tipoConsignacion),
    origen: str(p.origen),
    carpeta_completa: bool(p.carpeta_completa ?? p.carpetaCompleta),
    carpeta_con_oficio: bool(p.carpeta_con_oficio ?? p.carpetaConOficio),
    carpeta_entregada: bool(p.carpeta_entregada ?? p.carpetaEntregada),
    tiene_iva: bool(p.tiene_iva ?? p.tieneIVA),
    nota: str(p.nota),
    status: str(p.status),
    creado_por: str(p.creado_por ?? p.creadoPor),
    editado_por: str(p.editado_por ?? p.editadoPor),
    fecha_creacion: dateOnly(p.fecha_creacion ?? p.fechaCreacion),
    fecha_edicion: dateOnly(p.fecha_edicion ?? p.fechaEdicion),
    created_at: str(p.created_at),
    updated_at: str(p.updated_at),
    venta_cliente_id: str(p.venta_cliente_id ?? p.ventaClienteId),
    fecha_venta: dateOnly(p.fecha_venta ?? p.fechaVenta),
  }
  return { vehiculo }
}

const PERITAJE_DROP = new Set(['id', 'vehiculo_id', 'vehiculoId', 'created_at', 'updated_at'])

export function transformPeritaje(p) {
  const secciones = {}
  for (const [k, v] of Object.entries(p)) {
    if (PERITAJE_DROP.has(k)) continue
    if (v && typeof v === 'object' && !Array.isArray(v) && /^sec_[a-z]$/.test(k)) {
      for (const [sk, sv] of Object.entries(v)) secciones[sk] = sv
    } else {
      secciones[k] = v
    }
  }
  return {
    id: num(p.id),
    vehiculo_id: str(p.vehiculo_id ?? p.vehiculoId),
    fecha_peritaje: dateOnly(p.fecha_peritaje ?? p.fechaPeritaje ?? p.fecha),
    peritado_por: str(p.peritado_por ?? p.peritadoPor ?? p.peritador),
    resena_texto: str(p.resena_texto ?? p.resenaTexto ?? p.observaciones),
    costo_total: num(p.costo_total ?? p.costoTotal),
    secciones,
  }
}

export const GESTORIA_ITEMS = [
  'form08', 'verif_policial', 'multas_nac', 'dominio_hist',
  'libre_deudas', 'titulo', 'cedulas', 'identificacion',
]

// nested-POST key → standard slug
const GESTORIA_ALIAS = {
  form08: 'form08',
  verificPolicial: 'verif_policial',
  verif_policial: 'verif_policial',
  multasNac: 'multas_nac',
  multas_nac: 'multas_nac',
  dominioHist: 'dominio_hist',
  dominio_hist: 'dominio_hist',
  libreDeudas: 'libre_deudas',
  libre_deudas: 'libre_deudas',
  titulo: 'titulo',
  cedulas: 'cedulas',
  identificacion: 'identificacion',
}

function gestoriaItemFromFlat(p, slug) {
  return {
    checked: bool(p[slug]),
    fecha: dateOnly(p[slug + '_fecha']),
    obs: str(p[slug + '_nota']),
    marcado_por: null,
  }
}

function gestoriaItemFromNested(v) {
  return {
    checked: bool(v.checked),
    fecha: dateOnly(v.fecha),
    obs: str(v.obs),
    marcado_por: str(v.marcadoPor ?? v.marcado_por),
  }
}

export function transformGestoria(p) {
  const items = {}
  if (p.items && typeof p.items === 'object') {
    for (const [k, v] of Object.entries(p.items)) {
      const slug = GESTORIA_ALIAS[k] ?? k
      items[slug] = v && typeof v === 'object' ? gestoriaItemFromNested(v) : { checked: bool(v), fecha: null, obs: null, marcado_por: null }
    }
  } else {
    for (const slug of GESTORIA_ITEMS) items[slug] = gestoriaItemFromFlat(p, slug)
  }
  const row = {
    id: num(p.id),
    vehiculo_id: str(p.vehiculo_id ?? p.vehiculoId),
    estado: str(p.estado),
    notas: str(p.notas),
    fecha_inicio: dateOnly(p.fecha_inicio ?? p.fechaInicio),
    fecha_cierre: dateOnly(p.fecha_cierre ?? p.fechaCierre),
    items,
  }
  for (const slug of GESTORIA_ITEMS) row[slug] = Boolean(items[slug]?.checked)
  return row
}
