import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

// Variables de entorno: primero las propias del servidor (servidor/.env), después las
// del proyecto (la raíz del repo), que ya tiene las credenciales de Supabase. Lo que ya
// está definido en el entorno nunca se pisa.
export const ARCHIVOS_ENV = [path.join(raiz, '.env'), path.resolve(raiz, '..', '..', '.env')]
// Lo que vino del entorno real, antes de leer los archivos: eso no se relee.
const ENV_REAL = { ...process.env }
for (const archivo of ARCHIVOS_ENV) {
  try {
    process.loadEnvFile(archivo)
  } catch {
    // No existe: se sigue con lo que haya en el entorno.
  }
}

const env = process.env

export const PUERTO = Number(env.PUERTO || env.PORT) || 3100
// Por defecto solo esta PC. Para que entren otras computadoras va HOST=0.0.0.0, y el
// servidor exige que el login con el CRM esté configurado.
export const HOST = env.HOST || '127.0.0.1'
export const DATA_DIR = path.resolve(raiz, env.DATA_DIR || 'data')
export const WEB_DIR = path.resolve(raiz, '..', 'web')

// Archivos más grandes que esto no se descargan automáticamente.
export const MEDIA_MAX_BYTES = 50 * 1024 * 1024
// Mensajes con más antigüedad que esto (historial) no bajan la multimedia al llegar;
// se descarga cuando alguien la abre.
export const MEDIA_RECIENTE_SEG = 15 * 60

export const BAILEYS_LOG = env.BAILEYS_LOG || 'silent'

/* ---------------- Dónde se guardan mensajes y chats ---------------- */

// Conexión directa a la base de WhatsApp en Supabase (Connect → Session pooler).
export const WA_DATABASE_URL = env.WA_DATABASE_URL || env.WA_SUPABASE_URL || ''
// 'supabase' (por defecto si hay conexión) o 'local' (archivos en DATA_DIR, para pruebas).
// La sesión de WhatsApp y los archivos multimedia siguen en DATA_DIR en los dos casos.
export const ALMACEN = (env.ALMACEN || (WA_DATABASE_URL ? 'supabase' : 'local')).toLowerCase()

/* ---------------- Cuánto tiempo se guarda ---------------- */

// Se guardan los mensajes y archivos de los últimos VENTANA_DIAS días. Todos los días se
// borra lo que quedó afuera (mensajes, y sus archivos en R2 o en el disco), y lo más viejo
// que manda WhatsApp con el historial no se guarda.
export const VENTANA_DIAS = Number(env.WA_VENTANA_DIAS) || 365

/* ---------------- Dónde se guardan los archivos ---------------- */

// Fotos, audios, videos, stickers, documentos y fotos de perfil van a Cloudflare R2 si
// está WA_R2_BUCKET; si no, al disco (DATA_DIR). El bucket tiene que ser PRIVADO: el
// servidor entrega cada archivo solo a quien entró desde el CRM. No usar el bucket
// público del catálogo: ahí cualquiera con el enlace vería las conversaciones.
// Las credenciales pueden ser propias (WA_R2_*) o las mismas del CRM (R2_*), si el token
// tiene acceso a este bucket.
export const R2 = {
  bucket: env.WA_R2_BUCKET || '',
  endpoint: env.WA_R2_ENDPOINT || env.R2_ENDPOINT || '',
  accessKeyId: env.WA_R2_ACCESS_KEY_ID || env.R2_ACCESS_KEY_ID || '',
  secretAccessKey: env.WA_R2_SECRET_ACCESS_KEY || env.R2_SECRET_ACCESS_KEY || '',
}
export const ARCHIVOS_EN_R2 = Boolean(R2.bucket && R2.endpoint && R2.accessKeyId && R2.secretAccessKey)

/* ---------------- Login con el CRM ---------------- */

export const SUPABASE_URL = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
export const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''
// Solo del lado del servidor: lee crm.usuarios sin depender de la sesión.
export const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || ''
// Adónde mandar al que entra sin sesión.
export const CRM_URL = (env.CRM_URL || '').replace(/\/+$/, '')
// Roles del CRM que pueden usar el WhatsApp. Vacío (por defecto): todo usuario activo.
export const ROLES_WHATSAPP = (env.WHATSAPP_ROLES ?? '')
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean)
/**
 * Único número que se acepta como línea (con código de país). Si alguien escanea el QR con
 * otro celular, se desvincula solo. Vacío: se acepta cualquiera.
 * Se lee en vivo de los .env (no solo al arrancar): cambiar el número no pide reiniciar.
 */
export function numeroLinea() {
  if (ENV_REAL.WHATSAPP_NUMERO !== undefined) return limpiarNumero(ENV_REAL.WHATSAPP_NUMERO)
  for (const archivo of ARCHIVOS_ENV) {
    try {
      const valor = parseEnv(fs.readFileSync(archivo, 'utf8')).WHATSAPP_NUMERO
      if (valor !== undefined) return limpiarNumero(valor)
    } catch {
      // No existe o no se pudo leer: se prueba el siguiente.
    }
  }
  return ''
}
// Lo que sigue a un # es comentario; del resto quedan solo los dígitos.
const limpiarNumero = (valor) => String(valor).split('#')[0].replace(/\D/g, '')
// Firma de la cookie de sesión. Si no se define, se genera una y se guarda en DATA_DIR.
export const SESION_SECRETO = env.SESION_SECRETO || ''
export const SESION_HORAS = Number(env.SESION_HORAS) || 12

// WHATSAPP_LOGIN=off lo apaga, pero solo se acepta si el panel escucha únicamente en esta PC.
export const LOGIN_CONFIGURADO =
  env.WHATSAPP_LOGIN !== 'off' && Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY)
export const SOLO_ESTA_PC = ['127.0.0.1', 'localhost', '::1'].includes(HOST)

// Sitios que pueden mostrar el panel dentro de una página (el CRM lo embebe). Sale de
// CRM_URL; en esta PC también se acepta el CRM de desarrollo (localhost).
export const ORIGENES_CRM = [
  ...(CRM_URL ? [new URL(CRM_URL).origin] : []),
  ...(SOLO_ESTA_PC ? ['http://localhost:*', 'http://127.0.0.1:*'] : []),
]
