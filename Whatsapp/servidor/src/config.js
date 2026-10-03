import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

// Variables de entorno: primero las propias del servidor (servidor/.env), después las
// del proyecto (la raíz del repo), que ya tiene las credenciales de Supabase. Lo que ya
// está definido en el entorno nunca se pisa.
for (const archivo of [path.join(raiz, '.env'), path.resolve(raiz, '..', '..', '.env')]) {
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

/* ---------------- Login con el CRM ---------------- */

export const SUPABASE_URL = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
export const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''
// Solo del lado del servidor: lee crm.usuarios y crm.roles sin depender de la sesión.
export const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || ''
// Adónde mandar al que entra sin sesión.
export const CRM_URL = (env.CRM_URL || '').replace(/\/+$/, '')
// Roles que entran siempre, aunque no tengan la vista "whatsapp" marcada.
export const ROLES_SIEMPRE = (env.WHATSAPP_ROLES_SIEMPRE ?? 'admin,dueno')
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean)
// Roles que pueden vincular y desvincular la línea (ven el QR). El resto solo usa la bandeja.
export const ROLES_LINEA = (env.WHATSAPP_ROLES_LINEA ?? 'admin,dueno')
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean)
// Único número que se acepta como línea (con código de país). Si alguien escanea el QR con
// otro celular, se desvincula solo. Vacío: se acepta cualquiera.
export const NUMERO_LINEA = (env.WHATSAPP_NUMERO || '').replace(/\D/g, '')
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
