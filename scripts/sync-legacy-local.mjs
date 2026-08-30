// Primera corrida completa del clon del CRM viejo, fuera del limite de 300s
// de Vercel. Uso: node --env-file=.env scripts/sync-legacy-local.mjs
import { syncLegacyCrm } from '../src/server/legacySync.js'

const env = process.env
const run = await syncLegacyCrm({
  supabaseUrl: env.VITE_SUPABASE_URL,
  serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  crmUser: env.CRM_SYNC_USER,
  crmPass: env.CRM_SYNC_PASS,
  r2: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    endpoint: env.R2_ENDPOINT,
    bucket: env.R2_BUCKET_NAME,
    publicUrlBase: env.R2_PUBLIC_URL,
  },
  disparadoPor: 'manual',
})
console.log(JSON.stringify(run, null, 2))
process.exit(run.ok || run.estado === 'error' ? 0 : 1)
