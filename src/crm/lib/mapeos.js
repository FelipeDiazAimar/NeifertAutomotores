export { resumenPeritaje } from './peritajeSchema.js'

const b = (v) => v === true || v === 1 || v === '1'
const n = (v) => (v === '' || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const s = (v) => {
  const x = v == null ? null : String(v).trim()
  return x === '' ? null : x
}
const d = (v) => {
  const x = s(v)
  return !x || x.startsWith('0000-00-00') ? null : x.slice(0, 10)
}

const ESTADOS_VEH = new Set(['disponible', 'reservado', 'vendido', 'baja'])
export function mapEstadoVehiculo(status) {
  const x = s(status)?.toLowerCase()
  return x && ESTADOS_VEH.has(x) ? x : 'baja'
}

export function mapVehiculo(l) {
  return {
    id_legacy: s(l.id),
    marca: s(l.brand ?? l.marca) ?? '',
    modelo: s(l.model ?? l.modelo) ?? '',
    version: s(l.version),
    patente: s(l.patente),
    tipo: s(l.tipo),
    anio: n(l.year ?? l.anio),
    km: n(l.km),
    transmision: s(l.trans),
    color: s(l.color),
    moneda: s(l.moneda_contado ?? l.monedaContado)?.toUpperCase() === 'USD' ? 'USD' : 'ARS',
    precio_contado: n(l.precio_contado ?? l.precioContado),
    precio_canje: n(l.precio_canje ?? l.precioCanje),
    duenio_nombre: s(l.duenio_nombre ?? l.duenioNombre),
    duenio_apellido: s(l.duenio_apellido ?? l.duenioApellido),
    duenio_contacto: s(l.duenio_contacto ?? l.duenioContacto),
    itv: s(l.itv),
    itv_venc: d(l.itv_venc ?? l.itvVenc),
    consignacion: b(l.consignacion),
    tipo_consignacion: s(l.tipo_consignacion ?? l.tipoConsignacion),
    origen: s(l.origen),
    carpeta_completa: b(l.carpeta_completa ?? l.carpetaCompleta),
    carpeta_con_oficio: b(l.carpeta_con_oficio ?? l.carpetaConOficio),
    carpeta_entregada: b(l.carpeta_entregada ?? l.carpetaEntregada),
    tiene_iva: b(l.tiene_iva ?? l.tieneIVA),
    nota: s(l.nota),
    estado: mapEstadoVehiculo(l.status),
  }
}

const GESTORIA_ITEMS = [
  'form08', 'verif_policial', 'multas_nac', 'dominio_hist',
  'libre_deudas', 'titulo', 'cedulas', 'identificacion',
]

export function mapGestoria(l) {
  const out = {
    id_legacy: l.id ?? null,
    notas: s(l.notas),
    fecha_inicio: d(l.fecha_inicio ?? l.fechaInicio),
    fecha_cierre: d(l.fecha_cierre ?? l.fechaCierre),
    items_extra: {},
  }
  for (const it of GESTORIA_ITEMS) {
    out[`${it}_hecho`] = b(l[it])
    out[`${it}_fecha`] = d(l[`${it}_fecha`])
    out[`${it}_nota`] = s(l[`${it}_nota`])
  }
  return out
}
