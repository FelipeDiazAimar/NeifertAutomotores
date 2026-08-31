// Keys del peritaje que son checklist de condición (tipo 'estado': ok /
// observación / falta / na). Extraídas del POST de peritaje.php
// (scraping/NewEndpoints/*.har). Las keys de texto (obs*, mantenimiento,
// f* historial), costo (costo*), porcentaje/daño de carrocería (daño*, pct*)
// y códigos (dtcCode*) NO son de estado.
export const PERITAJE_ITEMS_ESTADO = [
  // Motor y transmisión
  'motor', 'cajaAT', 'embrague', 'cuatroX4', 'diferencial',
  // Rodante y frenos
  'frenos', 'trenDelant', 'amortiguadores',
  // Electrónica y diagnóstico
  'abs', 'motorLuz', 'airbag', 'transLuz', 'bateria',
  // Accesorios y equipamiento
  'gatoLlave', 'ruedaAux', 'matafuego', 'balizas', 'antirrobos', 'alarma',
  'segundaLlave', 'manualUnidad', 'codigosRadio', 'carpetaDoc', 'audio',
  'calefaccion', 'ac', 'vidriosElec', 'cierreCentral', 'cinturon', 'frenoMano',
  // Tapizados e interior
  'butacaIzq', 'butacaDer', 'asientoTras', 'tapizPuertas', 'tapizTecho', 'bandejaT',
]
