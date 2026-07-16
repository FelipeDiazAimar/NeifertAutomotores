import { fetchAllVehicles, createVehicle, updateVehicle } from './vehicles.service'
import { trackEvent } from './events.service'
import { ARS_TO_USD_RATE } from '@/lib/constants'
import { useSiteStore, slugify } from '@/store/useSiteStore'

/** Sincronización de vehículos desde el CRM viejo (neifertcrm.com), de solo
 *  lectura hacia allá: nunca escribimos en su base. Trae marca/modelo/año/km/
 *  transmisión/color/precio/categoría/estado; NO trae fotos, descripción de
 *  marketing ni datos del dueño anterior (privados, sin uso público).
 *
 *  Merge de 3 vías: si un campo sincronizado fue editado a mano en nuestro
 *  panel desde el último sync (ya no coincide con `external_snapshot`), esa
 *  edición manual se respeta y el CRM viejo no la pisa — pero seguimos
 *  actualizando el snapshot para comparar correctamente la próxima vez. */

const EXTERNAL_SOURCE = 'crm_viejo'

// Campos que sí trae y actualiza el CRM viejo (el resto — fotos, descripción,
// is_premium, fuel_type — quedan siempre a cargo del admin de nuestro sitio).
const SYNCED_FIELDS = [
  'brand', 'model', 'version', 'color', 'year', 'km',
  'transmission', 'category', 'status', 'currency', 'price_amount', 'price_usd',
]

const TIPO_LABELS = {
  Pickup: 'Pickup',
  SUV: 'SUV',
  Sedan: 'Sedán',
  Hatchback: 'Hatchback',
  Familiar: 'Familiar',
  Utilitario: 'Utilitario',
  Camioneta: 'Camioneta',
  Moto: 'Moto',
}

/** Trae los vehículos crudos del CRM viejo (vía nuestro proxy, evita CORS). */
export async function fetchExternalVehicles() {
  const res = await fetch('/api/crm/vehiculos')
  const json = await res.json()
  if (!json?.ok) throw new Error(json?.error || 'No se pudo conectar con el CRM viejo.')
  return json.data || []
}

/** Busca la categoría cuyo id coincide con el slug del tipo; si no existe la
 *  crea (evita duplicar categorías ya existentes como "sedan"/"suv"/"pickup"). */
function resolveCategoryId(tipo) {
  const label = TIPO_LABELS[tipo] || tipo || 'Otros'
  const slug = slugify(label)
  const store = useSiteStore.getState()
  if (store.categories.some((c) => c.id === slug)) return slug
  store.addCategory(label)
  return useSiteStore.getState().categories.find((c) => c.id === slug)?.id || slug
}

/** Mapea un vehículo crudo del CRM viejo a nuestro shape (solo campos públicos). */
function mapExternalVehicle(raw, categoryId) {
  const amount = raw.precio_contado ?? raw.precio_canje ?? null
  const currency = raw.precio_contado != null ? raw.moneda_contado || 'USD' : raw.moneda_canje || 'USD'
  const priceUsd = amount == null ? 0 : currency === 'ARS' ? amount * ARS_TO_USD_RATE : amount
  const transmission = raw.trans ? (/manual/i.test(raw.trans) ? 'Manual' : 'Automática') : null

  const synced = {
    brand: raw.brand || '',
    model: raw.model || '',
    version: raw.version || null,
    color: raw.color || null,
    year: raw.year ?? null,
    km: raw.km ?? 0,
    transmission,
    category: categoryId,
    status: ['disponible', 'reservado', 'vendido'].includes(raw.status) ? raw.status : 'disponible',
    currency,
    price_amount: amount,
    price_usd: priceUsd,
  }

  return {
    ...synced,
    external_id: String(raw.id),
    external_source: EXTERNAL_SOURCE,
    external_snapshot: synced,
    external_synced_at: new Date().toISOString(),
  }
}

/** Corre la sincronización completa. Devuelve un resumen para mostrar en el admin. */
export async function syncVehiclesFromCrm() {
  const [localList, externalList] = await Promise.all([fetchAllVehicles(), fetchExternalVehicles()])
  const localByExtId = new Map(localList.filter((v) => v.external_id).map((v) => [v.external_id, v]))

  let created = 0
  let updated = 0
  let unchanged = 0
  const errors = []

  for (const raw of externalList) {
    try {
      const categoryId = resolveCategoryId(raw.tipo)
      const mapped = mapExternalVehicle(raw, categoryId)
      const local = localByExtId.get(mapped.external_id)

      if (!local) {
        await createVehicle({
          ...mapped,
          fuel_type: 'Nafta', // el CRM viejo no distingue combustible; ajustable a mano
          is_premium: false,
          images: [],
          description: '',
        })
        created++
        continue
      }

      const prevSnapshot = local.external_snapshot || {}
      const patch = {}
      for (const field of SYNCED_FIELDS) {
        const stillPristine =
          prevSnapshot[field] === undefined ||
          JSON.stringify(local[field]) === JSON.stringify(prevSnapshot[field])
        if (stillPristine && JSON.stringify(local[field]) !== JSON.stringify(mapped[field])) {
          patch[field] = mapped[field]
        }
      }

      if (Object.keys(patch).length > 0) {
        updated++
      } else {
        unchanged++
      }

      // El CRM viejo lo marcó vendido recién ahora: registra la venta real
      // para el embudo, igual que si se marcara a mano en nuestro panel.
      if (patch.status === 'vendido' && local.status !== 'vendido') {
        trackEvent(local.id, 'venta')
      }

      await updateVehicle(local.id, {
        ...patch,
        external_snapshot: mapped.external_snapshot,
        external_synced_at: mapped.external_synced_at,
      })
    } catch (e) {
      errors.push(`${raw.brand || '?'} ${raw.model || ''}: ${e.message}`)
    }
  }

  return { created, updated, unchanged, total: externalList.length, errors }
}
