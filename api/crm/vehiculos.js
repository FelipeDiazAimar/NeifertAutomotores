import { fetchCrmVehiculos } from '../../src/server/crmCore.js'

/** Vercel Serverless Function — equivalente en producción de
 *  src/plugins/crmProxy.js (que solo corre en `vite dev`).
 *
 * GET /api/crm/vehiculos → login interno (cacheado) + vehiculos.php
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const syncUser = process.env.CRM_SYNC_USER
  const syncPass = process.env.CRM_SYNC_PASS
  if (!syncUser || !syncPass) {
    return res.status(501).json({
      ok: false,
      error: 'Falta CRM_SYNC_USER/CRM_SYNC_PASS en el servidor para sincronizar vehículos.',
    })
  }

  try {
    const json = await fetchCrmVehiculos({ syncUser, syncPass })
    res.status(200).json(json)
  } catch (e) {
    console.error('[crm-proxy] vehiculos:', e.message)
    res.status(502).json({ ok: false, error: e.message })
  }
}
