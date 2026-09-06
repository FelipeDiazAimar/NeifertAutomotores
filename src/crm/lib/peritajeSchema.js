// Estructura del peritaje (~120 campos). Fuente: keys del POST peritaje.php
// (scraping/NewEndpoints/*.har). `tipo`: 'estado' (checklist ok/obs/falta/na) |
// 'texto' | 'moneda' | 'porcentaje'. Form y lectura se generan de acá.

const PANELES_CARROCERIA = [
  ['Capo', 'Capó'],
  ['Techo', 'Techo'],
  ['Baul', 'Baúl'],
  ['ParaDelant', 'Paragolpes del.'],
  ['ParaTras', 'Paragolpes tras.'],
  ['PuertaDelIzq', 'Puerta del. izq.'],
  ['PuertaDelDer', 'Puerta del. der.'],
  ['PuertaTrasIzq', 'Puerta tras. izq.'],
  ['PuertaTrasDer', 'Puerta tras. der.'],
  ['GdaDelIzq', 'Guardabarros del. izq.'],
  ['GdaDelDer', 'Guardabarros del. der.'],
  ['GdaTrasIzq', 'Guardabarros tras. izq.'],
  ['GdaTrasDer', 'Guardabarros tras. der.'],
  ['EspejoIzq', 'Espejo izq.'],
  ['EspejoDer', 'Espejo der.'],
]

export const PERITAJE_SECCIONES = [
  {
    id: 'motor',
    titulo: 'Motor y transmisión',
    items: [
      { key: 'motor', label: 'Motor', tipo: 'estado' },
      { key: 'cajaAT', label: 'Caja automática', tipo: 'estado' },
      { key: 'embrague', label: 'Embrague', tipo: 'estado' },
      { key: 'cuatroX4', label: 'Tracción 4x4', tipo: 'estado' },
      { key: 'diferencial', label: 'Diferencial', tipo: 'estado' },
      { key: 'mantenimiento', label: 'Últ. mantenimiento', tipo: 'texto' },
      { key: 'obsMotor', label: 'Observaciones', tipo: 'texto' },
      { key: 'costoB', label: 'Costo estimado', tipo: 'moneda' },
    ],
  },
  {
    id: 'rodante',
    titulo: 'Rodante y frenos',
    items: [
      { key: 'frenos', label: 'Frenos', tipo: 'estado' },
      { key: 'trenDelant', label: 'Tren delantero', tipo: 'estado' },
      { key: 'amortiguadores', label: 'Amortiguadores', tipo: 'estado' },
      { key: 'obsC', label: 'Observaciones', tipo: 'texto' },
      { key: 'costoC', label: 'Costo estimado', tipo: 'moneda' },
    ],
  },
  {
    id: 'electronica',
    titulo: 'Electrónica y diagnóstico',
    items: [
      { key: 'abs', label: 'ABS', tipo: 'estado' },
      { key: 'motorLuz', label: 'Testigo motor', tipo: 'estado' },
      { key: 'airbag', label: 'Airbag', tipo: 'estado' },
      { key: 'transLuz', label: 'Testigo transmisión', tipo: 'estado' },
      { key: 'bateria', label: 'Batería', tipo: 'estado' },
      { key: 'dtcCode1', label: 'Código DTC 1', tipo: 'texto' },
      { key: 'dtcCode2', label: 'Código DTC 2', tipo: 'texto' },
      { key: 'dtcCode3', label: 'Código DTC 3', tipo: 'texto' },
      { key: 'dtcOtros', label: 'Otros códigos', tipo: 'texto' },
      { key: 'obsD', label: 'Observaciones', tipo: 'texto' },
      { key: 'costoD', label: 'Costo estimado', tipo: 'moneda' },
    ],
  },
  {
    id: 'accesorios',
    titulo: 'Accesorios y equipamiento',
    items: [
      { key: 'gatoLlave', label: 'Gato y llave', tipo: 'estado' },
      { key: 'ruedaAux', label: 'Rueda de auxilio', tipo: 'estado' },
      { key: 'matafuego', label: 'Matafuego', tipo: 'estado' },
      { key: 'balizas', label: 'Balizas', tipo: 'estado' },
      { key: 'antirrobos', label: 'Antirrobos', tipo: 'estado' },
      { key: 'alarma', label: 'Alarma', tipo: 'estado' },
      { key: 'segundaLlave', label: 'Segunda llave', tipo: 'estado' },
      { key: 'manualUnidad', label: 'Manual de la unidad', tipo: 'estado' },
      { key: 'codigosRadio', label: 'Códigos de radio', tipo: 'estado' },
      { key: 'carpetaDoc', label: 'Carpeta de documentación', tipo: 'estado' },
      { key: 'audio', label: 'Audio', tipo: 'estado' },
      { key: 'calefaccion', label: 'Calefacción', tipo: 'estado' },
      { key: 'ac', label: 'Aire acondicionado', tipo: 'estado' },
      { key: 'vidriosElec', label: 'Vidrios eléctricos', tipo: 'estado' },
      { key: 'cierreCentral', label: 'Cierre centralizado', tipo: 'estado' },
      { key: 'cinturon', label: 'Cinturones', tipo: 'estado' },
      { key: 'frenoMano', label: 'Freno de mano', tipo: 'estado' },
    ],
  },
  {
    id: 'tapizados',
    titulo: 'Tapizados e interior',
    items: [
      { key: 'butacaIzq', label: 'Butaca izquierda', tipo: 'estado' },
      { key: 'butacaDer', label: 'Butaca derecha', tipo: 'estado' },
      { key: 'asientoTras', label: 'Asiento trasero', tipo: 'estado' },
      { key: 'tapizPuertas', label: 'Tapizado de puertas', tipo: 'estado' },
      { key: 'tapizTecho', label: 'Tapizado de techo', tipo: 'estado' },
      { key: 'bandejaT', label: 'Bandeja trasera', tipo: 'estado' },
      { key: 'obsE', label: 'Observaciones', tipo: 'texto' },
      { key: 'costoE', label: 'Costo estimado', tipo: 'moneda' },
    ],
  },
  {
    id: 'carroceria',
    titulo: 'Carrocería',
    items: [
      { key: 'obsExt', label: 'Observaciones exteriores', tipo: 'texto' },
      { key: 'desgasteCarroceria', label: 'Desgaste general', tipo: 'texto' },
      { key: 'costoA', label: 'Costo estimado', tipo: 'moneda' },
      ...PANELES_CARROCERIA.flatMap(([k, lbl]) => [
        { key: 'daño' + k, label: lbl + ' — daño', tipo: 'texto' },
        { key: 'pct' + k, label: lbl + ' — %', tipo: 'porcentaje' },
      ]),
      { key: 'costoCarroceria', label: 'Costo total carrocería', tipo: 'moneda' },
    ],
  },
  {
    id: 'historial',
    titulo: 'Historial y fondo',
    items: [
      { key: 'fHistorialServicios', label: 'Historial de servicios', tipo: 'texto' },
      { key: 'fHistorialObs', label: 'Obs. historial', tipo: 'texto' },
      { key: 'fCorreaDistrib', label: 'Correa de distribución', tipo: 'texto' },
      { key: 'fCorreaDistribObs', label: 'Obs. correa', tipo: 'texto' },
      { key: 'fNeumaticosEstado', label: 'Estado neumáticos', tipo: 'texto' },
      { key: 'fNeumaticosReemplazo', label: 'Reemplazo neumáticos', tipo: 'texto' },
      { key: 'fNneumaticosMarca', label: 'Marca neumáticos', tipo: 'texto' },
      { key: 'fPrimerDuenio', label: 'Primer dueño', tipo: 'texto' },
      { key: 'fParabrisas', label: 'Parabrisas', tipo: 'texto' },
      { key: 'fNotaPropietario', label: 'Nota del propietario', tipo: 'texto' },
      { key: 'costoF', label: 'Costo estimado', tipo: 'moneda' },
    ],
  },
]

export const PERITAJE_ITEMS_ESTADO = PERITAJE_SECCIONES.flatMap((s) => s.items)
  .filter((i) => i.tipo === 'estado')
  .map((i) => i.key)

const VAL = { ok: 'ok', obs: 'obs', 'observación': 'obs', observacion: 'obs', falta: 'falta', mal: 'falta' }

export const PERITAJE_ESTADOS = [
  { id: null, label: 'Todos' },
  { id: 'sin_iniciar', label: 'Sin peritar' },
  { id: 'en_proceso', label: 'En proceso' },
  { id: 'completo', label: 'Completo' },
]

export const PERITAJE_ESTADO_LABEL = {
  sin_iniciar: 'Sin peritar',
  en_proceso: 'En proceso',
  completo: 'Completo',
}

/** Estado derivado del peritaje más reciente de un vehículo:
 *  sin peritaje → 'sin_iniciar'; con faltas/observaciones o sin cargar nada →
 *  'en_proceso'; todo OK → 'completo'. */
export function estadoPeritaje(peritaje) {
  if (!peritaje) return 'sin_iniciar'
  const total = (peritaje.items_ok ?? 0) + (peritaje.items_obs ?? 0) + (peritaje.items_falta ?? 0)
  if (total === 0) return 'en_proceso'
  if ((peritaje.items_falta ?? 0) > 0 || (peritaje.items_obs ?? 0) > 0) return 'en_proceso'
  return 'completo'
}

/** Cuenta ok/observación/falta sobre los ítems de condición. Ignora vacío,
 *  'na'/'n/a' y cualquier valor que no sea de estado. */
export function resumenPeritaje(datos = {}) {
  let items_ok = 0
  let items_obs = 0
  let items_falta = 0
  for (const k of PERITAJE_ITEMS_ESTADO) {
    const raw = datos[k] == null ? null : String(datos[k]).trim().toLowerCase()
    const v = raw && VAL[raw]
    if (v === 'ok') items_ok++
    else if (v === 'obs') items_obs++
    else if (v === 'falta') items_falta++
  }
  return { items_ok, items_obs, items_falta }
}
