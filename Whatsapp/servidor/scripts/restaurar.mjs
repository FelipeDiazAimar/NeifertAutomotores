/*
 * Restaura la sesión de WhatsApp (y los .env) desde el respaldo cifrado en R2, para que
 * una PC nueva conecte la línea SIN escanear el QR.
 *
 * En la PC nueva, antes de `npm start`:
 *   1. Instalar el proyecto (git clone + npm install en Whatsapp/servidor).
 *   2. Crear Whatsapp/servidor/.env con solo esto (lo demás lo trae el respaldo):
 *        WA_R2_BUCKET=neifert-whatsapp
 *        WA_R2_ENDPOINT=https://<cuenta>.r2.cloudflarestorage.com
 *        WA_R2_ACCESS_KEY_ID=...
 *        WA_R2_SECRET_ACCESS_KEY=...
 *        WA_BACKUP_CLAVE=...   (la del gestor de contraseñas)
 *   3. npm run restaurar
 *   4. npm start → conecta sin QR.
 *
 * Opciones:
 *   --fecha=AAAA-MM-DD  usa el respaldo de ese día en vez del último
 *   --forzar            pisa una sesión o un .env que ya existan (por defecto no se tocan)
 *   --sin-env           restaura solo la sesión
 *
 * IMPORTANTE: la PC vieja tiene que estar APAGADA (o sin el servicio). Dos servidores con
 * la misma sesión se desconectan entre sí (error 440).
 */
import fs from 'node:fs'
import path from 'node:path'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)

const { ARCHIVOS_EN_R2, ARCHIVOS_ENV, BACKUP_CLAVE, DATA_DIR } = await import('../src/config.js')
if (!ARCHIVOS_EN_R2) {
  console.error('Falta configurar R2 en Whatsapp/servidor/.env (WA_R2_BUCKET, WA_R2_ENDPOINT, WA_R2_ACCESS_KEY_ID, WA_R2_SECRET_ACCESS_KEY).')
  process.exit(1)
}
if (!BACKUP_CLAVE) {
  console.error('Falta WA_BACKUP_CLAVE en Whatsapp/servidor/.env (la clave con la que se cifró el respaldo).')
  process.exit(1)
}
const { bajarRespaldo, CLAVE_ENV, CLAVE_SESION } = await import('../src/respaldo.js')

const AUTH_DIR = path.join(DATA_DIR, 'sesion')
const claveSesion = args.fecha ? `respaldo/historial/sesion-${args.fecha}.enc` : CLAVE_SESION

// 1. Sesión
const sesion = await bajarRespaldo(claveSesion)
if (!sesion) {
  console.error(`No hay respaldo de la sesión en ${claveSesion}.`)
  process.exit(1)
}
const nombres = Object.keys(sesion.archivos || {})
if (!nombres.includes('creds.json')) {
  console.error('El respaldo no tiene creds.json: no sirve para conectar.')
  process.exit(1)
}
if (fs.existsSync(path.join(AUTH_DIR, 'creds.json')) && !args.forzar) {
  console.error(`Ya hay una sesión en ${AUTH_DIR}. Para reemplazarla, corré de nuevo con --forzar.`)
  process.exit(1)
}
fs.rmSync(AUTH_DIR, { recursive: true, force: true })
fs.mkdirSync(AUTH_DIR, { recursive: true })
for (const n of nombres) fs.writeFileSync(path.join(AUTH_DIR, n), Buffer.from(sesion.archivos[n], 'base64'))
console.log(`Sesión restaurada: ${nombres.length} archivos (respaldo del ${sesion.creado}).`)

// 2. Configuración (.env)
if (!args['sin-env']) {
  const env = await bajarRespaldo(CLAVE_ENV)
  if (!env) {
    console.log('No hay respaldo de los .env: se deja la configuración como está.')
  } else {
    const destinos = [
      [ARCHIVOS_ENV[0], env.servidor, 'Whatsapp/servidor/.env'],
      [ARCHIVOS_ENV[1], env.proyecto, '.env del proyecto'],
    ]
    for (const [archivo, contenido, nombre] of destinos) {
      if (!contenido) continue
      // El .env del servidor ya existe (con las 5 líneas de arriba): se reemplaza por el
      // completo solo si tiene únicamente esas líneas, o con --forzar.
      const actual = fs.existsSync(archivo) ? fs.readFileSync(archivo, 'utf8') : ''
      const soloLoMinimo = actual.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).every((l) => /^(WA_R2_|WA_BACKUP_CLAVE)/.test(l.trim()))
      if (actual && !soloLoMinimo && !args.forzar) {
        console.log(`${nombre}: ya existe, no se toca (usá --forzar para reemplazarlo).`)
        continue
      }
      fs.writeFileSync(archivo, contenido)
      console.log(`${nombre}: restaurado (respaldo del ${env.creado}).`)
    }
  }
}
console.log('\nListo. Con la PC vieja apagada, arrancá el servidor: npm start')
