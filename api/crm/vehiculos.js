import { fetchExtVehiculos } from '../../src/server/crmCore.js'

/** Vercel Serverless Function — equivalente en producción de
 *  src/plugins/crmProxy.js (que solo corre en `vite dev`).
 *
 * GET /api/crm/vehiculos → stock disponible de la API pública del CRM viejo
 * (token estático, sin login — ver src/server/crmCore.js).
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const token = process.env.CRM_EXT_API_TOKEN
  if (!token) {
    return res.status(501).json({
      ok: false,
      error: 'Falta CRM_EXT_API_TOKEN en el servidor para sincronizar vehículos.',
    })
  }

  try {
    const data = await fetchExtVehiculos(token)
    res.status(200).json({ ok: true, data })
  } catch (e) {
    console.error('[crm-proxy] vehiculos:', e.message)
    res.status(502).json({ ok: false, error: e.message })
  }
}
