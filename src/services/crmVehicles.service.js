import { fetchAllVehicles, createVehicle, updateVehicle } from './vehicles.service'
import { trackEvent } from './events.service'
import { saveSiteContent } from './content.service'
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
// is_new, fuel_type — quedan siempre a cargo del admin de nuestro sitio).
// 'status' no está: el endpoint solo devuelve stock disponible, así que el
// estado se decide aparte (ver la pasada de "vendidos" en syncVehiclesFromCrm).
const SYNCED_FIELDS = [
  'brand', 'model', 'version', 'color', 'year', 'km',
  'transmission', 'category', 'currency', 'price_amount', 'price_usd',
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

/** Trae el stock disponible del CRM viejo (vía nuestro proxy, evita CORS). */
export async function fetchExternalVehicles() {
  const res = await fetch('/api/crm/vehiculos')
  const json = await res.json()
  if (!json?.ok) throw new Error(json?.error || 'No se pudo conectar con el CRM viejo.')
  return json.data || []
}

/** Busca la categoría cuyo id coincide con el slug del tipo; si no existe la
 *  crea (evita duplicar categorías ya existentes como "sedan"/"suv"/"pickup").
 *  La guarda de una — esto corre en el sync del CRM, no en /admin/contenido,
 *  así que no depende de su botón "Guardar cambios". */
function resolveCategoryId(tipo) {
  const label = TIPO_LABELS[tipo] || tipo || 'Otros'
  const slug = slugify(label)
  const store = useSiteStore.getState()
  if (store.categories.some((c) => c.id === slug)) return slug
  store.addCategory(label)
  const categories = useSiteStore.getState().categories
  saveSiteContent('categories', categories).catch((e) =>
    console.warn('[categorías] no se pudo guardar la nueva categoría:', e.message)
  )
  return categories.find((c) => c.id === slug)?.id || slug
}

/** Mapea un vehículo crudo del CRM viejo a nuestro shape (solo campos públicos).
 *  El endpoint es de solo stock disponible: no trae `status`, por eso acá
 *  siempre se marca 'disponible' — los que dejan de aparecer en el listado
 *  se marcan 'vendido' aparte (ver syncVehiclesFromCrm). Tampoco se usan sus
 *  `fotos`: la imagen/marketing del vehículo siempre queda a cargo del admin
 *  de este sitio (se guardan en el snapshot solo como referencia). */
function mapExternalVehicle(raw, categoryId) {
  const currency = raw.moneda || 'USD'
  const amount = raw.precio ?? null
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
    currency,
    price_amount: amount,
    price_usd: priceUsd,
  }

  return {
    ...synced,
    external_id: String(raw.id),
    external_source: EXTERNAL_SOURCE,
    external_snapshot: { ...synced, fotos: raw.fotos || [] },
    external_synced_at: new Date().toISOString(),
  }
}

/** Corre la sincronización completa. Devuelve un resumen para mostrar en el admin. */
export async function syncVehiclesFromCrm() {
  const [localList, externalList] = await Promise.all([fetchAllVehicles(), fetchExternalVehicles()])
  const localByExtId = new Map(localList.filter((v) => v.external_id).map((v) => [v.external_id, v]))
  const seenExtIds = new Set()

  let created = 0
  let updated = 0
  let unchanged = 0
  let soldOut = 0
  const errors = []

  for (const raw of externalList) {
    try {
      const categoryId = resolveCategoryId(raw.tipo)
      const mapped = mapExternalVehicle(raw, categoryId)
      seenExtIds.add(mapped.external_id)
      const local = localByExtId.get(mapped.external_id)

      if (!local) {
        await createVehicle({
          ...mapped,
          status: 'disponible',
          fuel_type: 'Nafta', // el CRM viejo no distingue combustible; ajustable a mano
          is_new: false,
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
      // Volvió a aparecer en el stock disponible (ej: se deshizo una venta
      // o una reserva) → recupera el estado 'disponible'.
      if (local.status !== 'disponible') patch.status = 'disponible'

      if (Object.keys(patch).length > 0) {
        updated++
      } else {
        unchanged++
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

  // El endpoint solo lista stock disponible: lo que ya no aparece y antes sí
  // (y vino del CRM viejo) se dio de baja allá — lo marcamos vendido acá,
  // igual que si se hiciera a mano, y registra la venta real para el embudo.
  for (const local of localList) {
    if (
      local.external_id &&
      local.external_source === EXTERNAL_SOURCE &&
      !seenExtIds.has(local.external_id) &&
      local.status !== 'vendido'
    ) {
      try {
        await updateVehicle(local.id, { status: 'vendido' })
        trackEvent(local.id, 'venta')
        soldOut++
      } catch (e) {
        errors.push(`${local.brand || '?'} ${local.model || ''}: ${e.message}`)
      }
    }
  }

  return { created, updated, unchanged, soldOut, total: externalList.length, errors }
}
