import { createExtLead, fetchExtWebLeads } from '../../src/server/crmCore.js'

/** Vercel Serverless Function — equivalente en producción de
 *  src/plugins/crmProxy.js (que solo corre en `vite dev`).
 *
 * GET  /api/crm/leads → leads que nosotros empujamos al CRM viejo (verificación)
 * POST /api/crm/leads → empuja un lead nuevo generado en el sitio
 *   body: { name, phone, notes?, brand?, model? }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const token = process.env.CRM_EXT_API_TOKEN
  if (!token) {
    return res.status(501).json({ ok: false, error: 'Falta CRM_EXT_API_TOKEN en el servidor.' })
  }

  if (req.method === 'GET') {
    try {
      const data = await fetchExtWebLeads(token)
      return res.status(200).json({ ok: true, data })
    } catch (e) {
      console.error('[crm-proxy] leads (GET):', e.message)
      return res.status(502).json({ ok: false, error: e.message })
    }
  }

  if (req.method === 'POST') {
    try {
      const { name, phone, notes, brand, model } = req.body || {}
      if (!name || !phone) {
        return res.status(400).json({ ok: false, error: 'Faltan name/phone.' })
      }
      const result = await createExtLead(token, { name, phone, notes, brand, model })
      return res.status(200).json({ ok: true, ...result })
    } catch (e) {
      console.error('[crm-proxy] leads (POST):', e.message)
      return res.status(502).json({ ok: false, error: e.message })
    }
  }

  res.status(405).json({ ok: false, error: 'Method not allowed' })
}
