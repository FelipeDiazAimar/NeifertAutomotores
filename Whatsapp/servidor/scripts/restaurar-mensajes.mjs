/*
 * Baja un respaldo de mensajes de R2 (respaldo/mensajes/AAAA-MM-DD.enc), lo descifra y
 * guarda el .zip en la carpeta actual. Ese .zip se carga en el panel con "Importar
 * respaldo" (no pisa lo que ya está: solo suma lo que falta).
 *
 *   npm run restaurar-mensajes                    el último
 *   npm run restaurar-mensajes -- --fecha=AAAA-MM-DD
 *
 * Necesita en Whatsapp/servidor/.env: R2 (WA_R2_*) y WA_BACKUP_CLAVE.
 */
import fs from 'node:fs'
import path from 'node:path'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)

const { ARCHIVOS_EN_R2, BACKUP_CLAVE } = await import('../src/config.js')
if (!ARCHIVOS_EN_R2 || !BACKUP_CLAVE) {
  console.error('Faltan R2 (WA_R2_*) y WA_BACKUP_CLAVE en Whatsapp/servidor/.env.')
  process.exit(1)
}
const { descifrar } = await import('../src/respaldo.js')
const { leer, listarArchivos } = await import('../src/archivos.js')

const PREFIJO = 'respaldo/mensajes/'
const disponibles = (await listarArchivos(PREFIJO)).map((a) => a.clave).filter((c) => /\d{4}-\d{2}-\d{2}\.enc$/.test(c)).sort()
const clave = args.fecha ? `${PREFIJO}${args.fecha}.enc` : disponibles.at(-1)
if (!clave || !disponibles.includes(clave)) {
  console.error(`No hay respaldo de mensajes${args.fecha ? ` del ${args.fecha}` : ''}. Hay: ${disponibles.map((c) => path.basename(c, '.enc')).join(', ') || 'ninguno'}.`)
  process.exit(1)
}
const zip = descifrar(await leer(clave), BACKUP_CLAVE)
const destino = path.resolve(`Mensajes de WhatsApp Neifert ${path.basename(clave, '.enc')}.zip`)
fs.writeFileSync(destino, zip)
console.log(`Listo: ${destino} (${(zip.length / 1024).toFixed(0)} KB). Cargalo en el panel con "Importar respaldo".`)
