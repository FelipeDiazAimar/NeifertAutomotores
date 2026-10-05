/*
 * Respalda ya la sesión de WhatsApp y los .env (cifrados, en R2). El servidor lo hace
 * solo; esto sirve para forzarlo, por ejemplo antes de mover el servicio a otra PC.
 *
 *   npm run respaldar
 */
const { BACKUP_CLAVE, ARCHIVOS_EN_R2, LINEA_DIR } = await import('../src/config.js')
if (!ARCHIVOS_EN_R2 || !BACKUP_CLAVE) {
  console.error('Para respaldar hacen falta R2 (WA_R2_*) y WA_BACKUP_CLAVE en Whatsapp/servidor/.env.')
  process.exit(1)
}
const path = await import('node:path')
const { respaldarEnv, respaldarSesion } = await import('../src/respaldo.js')
const sesion = await respaldarSesion(path.join(LINEA_DIR, 'sesion'))
console.log(sesion ? `Sesión respaldada: ${sesion.archivos} archivos, ${Math.round(sesion.bytes / 1024)} KB cifrados.` : 'No hay sesión vinculada para respaldar.')
const env = await respaldarEnv()
console.log(`Configuración respaldada: ${[env.servidor && 'Whatsapp/servidor/.env', env.proyecto && '.env del proyecto'].filter(Boolean).join(' y ') || 'ningún .env encontrado'}.`)
process.exit(0)
