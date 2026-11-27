/*
 * Abre un respaldo local (.enc, el que se baja con "Exportar todos los chats") y lo deja como .zip,
 * sin necesidad del panel: sirve para guardar el .enc afuera y poder recuperarlo igual.
 * Después, ese .zip se carga con "Cargar respaldo" (suma lo que falta, no duplica).
 *
 *   npm run descifrar-respaldo -- "Respaldo de WhatsApp Neifert 2026-12-01.enc"
 *   npm run descifrar-respaldo -- archivo.enc salida.zip
 *
 * Necesita WA_BACKUP_CLAVE (en Whatsapp/servidor/.env o en el entorno).
 */
import path from 'node:path'

const [origen, salida] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!origen) {
  console.error('Uso: npm run descifrar-respaldo -- <archivo.enc> [salida.zip]')
  process.exit(1)
}
const { BACKUP_CLAVE } = await import('../src/config.js')
if (!BACKUP_CLAVE) {
  console.error('Falta WA_BACKUP_CLAVE (en Whatsapp/servidor/.env o en el entorno).')
  process.exit(1)
}
const { descifrarArchivo, esRespaldoCifrado } = await import('../src/cifradoFlujo.js')
if (!esRespaldoCifrado(origen)) {
  console.error('Ese archivo no es un respaldo cifrado de WhatsApp Neifert.')
  process.exit(1)
}
const destino = path.resolve(salida || origen.replace(/\.enc$/i, '') + '.zip')
try {
  await descifrarArchivo(origen, destino, BACKUP_CLAVE)
  console.log(`Listo: ${destino}. Cargalo en el panel con "Cargar respaldo".`)
} catch (err) {
  console.error(`No se pudo descifrar: ${err.message}`)
  process.exit(1)
}
