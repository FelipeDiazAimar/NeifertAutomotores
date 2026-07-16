/** Categorías del catálogo (chips de filtro). El id matchea vehicles.category. */
export const VEHICLE_CATEGORIES = [
  { id: 'todos', label: 'Todos' },
  { id: 'suv', label: 'SUVs' },
  { id: 'sedan', label: 'Sedanes' },
  { id: 'coupe', label: 'Coupé' },
  { id: 'sport', label: 'Sport' },
  { id: 'electrico', label: 'Eléctricos' },
  { id: 'pickup', label: 'Pickups' },
]

/** Opciones de ordenamiento del catálogo. */
export const SORT_OPTIONS = [
  { id: 'price-desc', label: 'Precio Mayor' },
  { id: 'price-asc', label: 'Precio Menor' },
  { id: 'year-desc', label: 'Más nuevos' },
  { id: 'km-asc', label: 'Menos km' },
]

/** Estados de un lead en el CRM + estilo del badge. */
export const LEAD_STATUSES = {
  nuevo: { label: 'Nuevo', variant: 'red' },
  primer_contacto: { label: 'Primer Contacto', variant: 'outline' },
  seguimiento: { label: 'Seguimiento', variant: 'outline' },
  negociacion: { label: 'En Negociación', variant: 'amber' },
  vip: { label: 'Calificado / VIP', variant: 'green' },
  cerrado: { label: 'Cerrado', variant: 'green' },
}

/** Canales de captación de leads. */
export const LEAD_SOURCES = [
  'WhatsApp',
  'Instagram',
  'Web',
  'Showroom',
  'Referido',
  'Facebook',
]

/** Cotización aproximada ARS→USD, solo para ordenar/filtrar/analítica internamente
 *  (el precio se MUESTRA siempre en su moneda original, sin convertir). Ajustar
 *  a mano según el tipo de cambio vigente. */
export const ARS_TO_USD_RATE = 1 / 1000

export const FUEL_TYPES = ['Nafta', 'Eléctrico', 'Híbrido', 'Diésel']

export const TRANSMISSIONS = ['Automática', 'Manual', 'PDK', 'M Steptronic', 'F1 Dual-Clutch']

/** Teléfono de WhatsApp del salón (formato internacional sin + ni espacios). */
export const WHATSAPP_PHONE = '543564562413'

/** Navegación principal (tab-bar mobile + accesos). */
export const NAV_ITEMS = [
  { to: '/', label: 'Inicio', icon: 'Home' },
  { to: '/catalogo', label: 'Catálogo', icon: 'LayoutGrid' },
  { to: '/admin/crm', label: 'CRM', icon: 'Users', admin: true },
  { to: '/admin/estadisticas', label: 'Métricas', icon: 'BarChart3', admin: true },
]
