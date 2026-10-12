const STORAGE_KEY = 'nf-presupuesto-template-v1'

const nf = new Intl.NumberFormat('es-AR')

export function fechaHoyAR(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export function formatearPrecio(n) {
  if (n == null || n === '') return '—'
  const num = Number(n)
  if (Number.isNaN(num)) return String(n)
  return `$${nf.format(num)}`
}

export function tituloVehiculo(v = {}) {
  const t = [v.marca, v.modelo, v.version].filter(Boolean).join(' ').trim()
  return (t || 'Vehículo').toUpperCase()
}

export function subtituloVehiculo(v = {}) {
  const kmParte = v.es_0km || Number(v.km) === 0 ? '0 KM' : v.km != null && v.km !== '' ? `${nf.format(Number(v.km))} KM` : null
  const colorParte = v.color ? `COLOR: ${String(v.color).toUpperCase()}` : 'COLOR: A DEFINIR'
  return [kmParte || 'KM A DEFINIR', colorParte].join(' | ')
}

export const FINANCIACION_DEFAULT = [
  { entrega: 'Entrega $19.800.000 +', cuotas: '12 cuotas fijas de $2.500.000 + Seguro' },
  { entrega: 'Entrega $11.300.000 +', cuotas: '18 cuotas fijas de $2.720.000 + Seguro' },
  { entrega: 'Entrega $22.100.000 +', cuotas: '24 cuotas fijas de $1.490.000 + Seguro' },
  { entrega: 'Entrega $19.800.000 +', cuotas: '12 cuotas fijas de $2.500.000 + Seguro · primera cuota a 60 días' },
  { entrega: 'Entrega $19.800.000 +', cuotas: '30 cuotas fijas de $1.490.000 + Seguro' },
  { entrega: 'Entrega $24.800.000 +', cuotas: '18 cuotas fijas de $1.388.000 + Seguro' },
]

export const PRESUPUESTO_DEFAULTS = {
  incluye: 'Flete · Preentrega · Alfombras · Matafuego · Alistamiento',
  regalo: '¡REGALO SORPRESA 👇! 🧉🍷!',
  condiciones:
    'Seña hoy: $2.000.000.\n\nCancelación dentro del mes corriente. Antes se cancela, antes se tiene la unidad.',
  patentamientoTexto:
    'El patentamiento/inscripción se calcula según dónde se inscriba la unidad, facturación y costo de prenda si hay crédito. La unidad se entrega una vez culminado el trámite.',
  fechaLimite:
    'Presentación de inscripción en DNRPA antes del 30/09/2026 para conservar el precio establecido, que contempla los descuentos y bonificaciones del mes. Después de esa fecha pueden aplicarse beneficios perdidos o reajuste de precio del mes siguiente.',
  financiacion: FINANCIACION_DEFAULT,
}

export function cargarPlantillaGuardada() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out = { ...parsed }
    if (Array.isArray(parsed.financiacion)) {
      out.financiacion = FINANCIACION_DEFAULT.map((def, i) => ({
        entrega: parsed.financiacion[i]?.entrega ?? def.entrega,
        cuotas: parsed.financiacion[i]?.cuotas ?? def.cuotas,
      }))
    }
    return out
  } catch {
    return {}
  }
}

export function guardarPlantilla(datos) {
  try {
    const paraGuardar = {
      incluye: datos.incluye,
      regalo: datos.regalo,
      condiciones: datos.condiciones,
      patentamientoTexto: datos.patentamientoTexto,
      fechaLimite: datos.fechaLimite,
      financiacion: datos.financiacion,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(paraGuardar))
  } catch {
    // localStorage lleno o bloqueado: no rompe el flujo
  }
}

export function limpiarPlantillaGuardada() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // no-op
  }
}

/** Datos completos para renderizar: mezcla vehículo + plantilla guardada + overrides. */
export function construirDatosPresupuesto(vehiculo = {}, overrides = {}) {
  const guardada = cargarPlantillaGuardada()
  const financiacion = (overrides.financiacion ?? guardada.financiacion ?? PRESUPUESTO_DEFAULTS.financiacion).map(
    (f, i) => ({
      entrega: f?.entrega ?? FINANCIACION_DEFAULT[i]?.entrega ?? '',
      cuotas: f?.cuotas ?? FINANCIACION_DEFAULT[i]?.cuotas ?? '',
    }),
  )
  return {
    fecha: overrides.fecha ?? fechaHoyAR(),
    titulo: overrides.titulo ?? tituloVehiculo(vehiculo),
    subtitulo: overrides.subtitulo ?? subtituloVehiculo(vehiculo),
    precioEntrega: overrides.precioEntrega ?? formatearPrecio(vehiculo.precio_contado),
    patentamientoMonto: overrides.patentamientoMonto ?? guardada.patentamientoMonto ?? '$2.500.000',
    incluye: overrides.incluye ?? guardada.incluye ?? PRESUPUESTO_DEFAULTS.incluye,
    regalo: overrides.regalo ?? guardada.regalo ?? PRESUPUESTO_DEFAULTS.regalo,
    condiciones: overrides.condiciones ?? guardada.condiciones ?? PRESUPUESTO_DEFAULTS.condiciones,
    patentamientoTexto:
      overrides.patentamientoTexto ?? guardada.patentamientoTexto ?? PRESUPUESTO_DEFAULTS.patentamientoTexto,
    fechaLimite: overrides.fechaLimite ?? guardada.fechaLimite ?? PRESUPUESTO_DEFAULTS.fechaLimite,
    financiacion,
  }
}

export function nombreArchivoPresupuesto(vehiculo = {}, fecha = fechaHoyAR(), ext = 'png') {
  const base = [vehiculo.patente, vehiculo.marca, vehiculo.modelo].filter(Boolean).join('-') || vehiculo.id || 'vehiculo'
  const slug = String(base)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  const fechaSlug = String(fecha).replaceAll('/', '-')
  return `presupuesto-${slug || 'vehiculo'}-${fechaSlug}.${ext}`
}
