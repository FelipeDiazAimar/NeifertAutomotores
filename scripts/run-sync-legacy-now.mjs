// Dispara la sincronización crm_legacy <- CRM viejo (neifertcrm.com) ahora
// mismo, a mano. Descubrimos que el cron diario nunca corrió realmente en
// producción (solo hay 2 corridas manuales, ambas del 30/8) — esto trae los
// datos de hoy mientras se resuelve el cron.
// Uso: node --env-file=.env scripts/run-sync-legacy-now.mjs
import { handleSyncLegacy } from '../api/crm/sync-legacy.js'

const res = {
  statusCode: 0, body: null,
  setHeader() {},
  status(c) { this.statusCode = c; return this },
  json(b) { this.body = b; return this },
  end(b) { this.body = b ?? this.body; return this },
}

await handleSyncLegacy(
  { method: 'POST', headers: { authorization: 'Bearer ' + process.env.CRON_SECRET } },
  res,
  {},
)

console.log(JSON.stringify(res.body, null, 2))
process.exit(res.statusCode === 200 ? 0 : 1)
