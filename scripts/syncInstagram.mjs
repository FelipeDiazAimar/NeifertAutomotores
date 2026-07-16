/**
 * Sincroniza el feed de Instagram: trae los posteos reales del perfil,
 * descarga la imagen/video de cada uno y lo sube a NUESTRO storage
 * (Cloudflare R2) — así la web nunca depende de las URLs de Instagram
 * (que expiran/dan 403) ni de que Instagram nos deje scrapear en vivo
 * desde Vercel (bloquea las IPs de datacenter; desde una compu normal
 * funciona bien, por eso este script se corre local, no en el servidor).
 *
 * Uso:
 *   npm run sync:instagram                    (trae solo posteos nuevos; para en
 *                                               cuanto encuentra uno ya guardado)
 *   npm run sync:instagram -- --all           (carga completa: recorre todo el
 *                                               historial, sin parar en lo ya
 *                                               guardado — usar la primera vez
 *                                               o si falta traer posteos viejos)
 *   npm run sync:instagram -- --all --pages=20 (limita/ajusta cuántas páginas
 *                                               de 24 recorre; default 12 ≈ 288
 *                                               posteos, alcanza para el perfil
 *                                               actual de ~284)
 *
 * Necesita en .env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT,
 * R2_PUBLIC_URL (los mismos que ya usa la app).
 *
 * Alternativa sin usar la terminal: el ejecutable de scripts/instagramAgent/
 * (ver ese README/comentarios) hace lo mismo desde la compu de un empleado.
 */

import { runInstagramSync } from '../src/server/instagramCore.js'

const MAX_PAGES = Number(process.argv.find((a) => a.startsWith('--pages='))?.split('=')[1]) || 12
const FULL_SYNC = process.argv.includes('--all') || process.argv.includes('--full')

const {
  VITE_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_ENDPOINT,
  R2_PUBLIC_URL,
} = process.env

function requireEnv() {
  const missing = [
    ['VITE_SUPABASE_URL', VITE_SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
    ['R2_ACCESS_KEY_ID', R2_ACCESS_KEY_ID],
    ['R2_SECRET_ACCESS_KEY', R2_SECRET_ACCESS_KEY],
    ['R2_BUCKET_NAME', R2_BUCKET_NAME],
    ['R2_ENDPOINT', R2_ENDPOINT],
    ['R2_PUBLIC_URL', R2_PUBLIC_URL],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length) {
    console.error('Faltan estas variables en .env:', missing.join(', '))
    process.exit(1)
  }
}

async function main() {
  requireEnv()
  const result = await runInstagramSync({
    supabaseUrl: VITE_SUPABASE_URL,
    supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    r2AccessKeyId: R2_ACCESS_KEY_ID,
    r2SecretAccessKey: R2_SECRET_ACCESS_KEY,
    r2Bucket: R2_BUCKET_NAME,
    r2Endpoint: R2_ENDPOINT,
    r2PublicUrl: R2_PUBLIC_URL,
    fullSync: FULL_SYNC,
    maxPages: MAX_PAGES,
    onProgress: (msg) => console.log(msg),
  })
  console.log(`\n${result.message}`)
}

main().catch((e) => {
  console.error('Error:', e.message)
  process.exit(1)
})
