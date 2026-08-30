import { createHash } from 'node:crypto'
import { putR2Object } from './r2Core.js'

function sha1_12(s) {
  return createHash('sha1').update(s).digest('hex').slice(0, 12)
}

export function r2KeyForPhoto(vehiculoId, url) {
  let ext = 'jpg'
  try {
    const path = new URL(url).pathname
    const m = path.match(/\.([a-zA-Z0-9]{2,5})$/)
    if (m) ext = m[1].toLowerCase()
  } catch {}
  return `legacy/vehiculos/${vehiculoId}/${sha1_12(url)}.${ext}`
}

export async function syncFotosVehiculo({
  vehiculoId, urls, existentes, r2, bucket, publicUrlBase, fetchImpl,
}) {
  const doFetch = fetchImpl || fetch
  const yaEspejada = new Map(
    (existentes || []).filter((e) => e.url_espejo).map((e) => [e.url_origen, e.url_espejo]),
  )
  const filas = []
  let bajadas = 0
  let errores = 0

  for (let orden = 0; orden < urls.length; orden++) {
    const url = urls[orden]
    if (yaEspejada.has(url)) {
      filas.push({ vehiculo_id: vehiculoId, orden, url_origen: url, url_espejo: yaEspejada.get(url) })
      continue
    }
    try {
      const r = await doFetch(url, { signal: AbortSignal.timeout(20000) })
      if (!r.ok) throw new Error(`descarga ${r.status}`)
      const buf = Buffer.from(await r.arrayBuffer())
      const contentType = r.headers.get?.('content-type') || 'image/jpeg'
      const key = r2KeyForPhoto(vehiculoId, url)
      await putR2Object(r2, { bucket, filename: key, body: buf, contentType })
      const urlEspejo = `${publicUrlBase.replace(/\/$/, '')}/${key}`
      filas.push({
        vehiculo_id: vehiculoId, orden, url_origen: url, url_espejo: urlEspejo,
        bytes: buf.length, content_type: contentType, mirrored_at: new Date().toISOString(),
      })
      bajadas++
    } catch {
      errores++
      filas.push({ vehiculo_id: vehiculoId, orden, url_origen: url, url_espejo: null })
    }
  }
  return { filas, bajadas, errores }
}

export async function mirrorAllPhotos({
  vehiculos, fotosPorVehiculo, r2, bucket, publicUrlBase, fetchImpl, upsertFotos,
}) {
  let total = 0
  for (const v of vehiculos) {
    const urls = v.urls || []
    if (!urls.length) continue
    const res = await syncFotosVehiculo({
      vehiculoId: v.id, urls, existentes: fotosPorVehiculo.get(v.id) || [],
      r2, bucket, publicUrlBase, fetchImpl,
    })
    await upsertFotos(res.filas)
    total += res.bajadas
  }
  return total
}
