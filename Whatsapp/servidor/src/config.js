import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

export const PUERTO = Number(process.env.PUERTO) || 3100
// Solo localhost: la sesión de WhatsApp no tiene que quedar expuesta a la red.
export const HOST = process.env.HOST || '127.0.0.1'
export const DATA_DIR = path.resolve(raiz, process.env.DATA_DIR || 'data')
export const WEB_DIR = path.resolve(raiz, '..', 'web')

// Archivos más grandes que esto no se descargan automáticamente.
export const MEDIA_MAX_BYTES = 50 * 1024 * 1024
// Mensajes con más antigüedad que esto (historial) no bajan la multimedia al llegar;
// se descarga cuando alguien la abre.
export const MEDIA_RECIENTE_SEG = 15 * 60

export const BAILEYS_LOG = process.env.BAILEYS_LOG || 'silent'
