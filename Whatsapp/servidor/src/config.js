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
const lista = (valor) =>
  String(valor ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
const encendido = (valor, porDefecto) => (valor === undefined || valor === '' ? porDefecto : !['off', 'no', 'false', '0'].includes(String(valor).toLowerCase()))

export const RAIZ_SERVIDOR = raiz
export const PUERTO = Number(env.PUERTO || env.PORT) || 3100
// Por defecto solo esta PC. Para que entren otras computadoras va HOST=0.0.0.0, y el
// servidor exige que el login con el CRM esté configurado.
export const HOST = env.HOST || '127.0.0.1'
export const DATA_DIR = path.resolve(raiz, env.DATA_DIR || 'data')
export const WEB_DIR = path.resolve(raiz, '..', 'web')
// Detrás de un proxy (nginx, Cloudflare Tunnel) se toma la IP y el https que informa el
// proxy. En la PC titular, sin proxy, va apagado: así nadie puede inventarse su IP.
export const DETRAS_DE_PROXY = encendido(env.WA_DETRAS_DE_PROXY, false)

/* ---------------- Archivos multimedia ---------------- */

// El mismo límite que WhatsApp: 2 GB por archivo (documentos, videos, zip y demás), para
// bajar y para mandar. Lo más grande queda como "grande".
export const MEDIA_MAX_MB = Number(env.WA_MEDIA_MAX_MB) || 2048
export const MEDIA_MAX_BYTES = MEDIA_MAX_MB * 1024 * 1024
// Lo que se manda desde el navegador. Detrás del túnel de Cloudflare (plan gratis) cada
// pedido puede pesar hasta 100 MB (se deja margen: 95): lo más grande Cloudflare lo corta.
// Lo que llega de WhatsApp no pasa por el túnel, así que bajar sigue siendo hasta 2 GB.
export const SUBIDA_MAX_MB = Math.min(MEDIA_MAX_MB, Number(env.WA_SUBIDA_MAX_MB) || (DETRAS_DE_PROXY ? 95 : MEDIA_MAX_MB))
export const SUBIDA_MAX_BYTES = SUBIDA_MAX_MB * 1024 * 1024
// Lo que llega en vivo (más nuevo que esto) se baja en el momento; lo del historial va a
// la cola de descargas, de a uno.
export const MEDIA_RECIENTE_SEG = 15 * 60

export const BAILEYS_LOG = env.BAILEYS_LOG || 'silent'

// Versión del protocolo de WhatsApp Web, fija: así una actualización de WhatsApp no
// cambia el comportamiento sin que nadie se entere. Vacío: la que trae Baileys. Si
// WhatsApp la rechaza por vieja (error 405), el servidor consulta la vigente y lo avisa.
export const VERSION_WA = env.WA_VERSION ? env.WA_VERSION.split('.').map(Number) : null

/* ---------------- Dónde se guardan mensajes y chats ---------------- */

// Conexión directa a la base de WhatsApp en Supabase (Connect → Session pooler).
export const WA_DATABASE_URL = env.WA_DATABASE_URL || env.WA_SUPABASE_URL || ''
// 'supabase' (por defecto si hay conexión) o 'local' (archivos en DATA_DIR, para pruebas).
export const ALMACEN = (env.ALMACEN || (WA_DATABASE_URL ? 'supabase' : 'local')).toLowerCase()

/* ---------------- Cuánto tiempo se guarda ---------------- */

// Se guardan los mensajes y archivos de los últimos VENTANA_DIAS días. Todos los días se
// borra lo que quedó afuera (mensajes, y sus archivos en R2 o en el disco), y lo más viejo
// que manda WhatsApp con el historial no se guarda.
export const VENTANA_DIAS = Number(env.WA_VENTANA_DIAS) || 365

// Anti-borrado. Encendido (por defecto): un mensaje que alguien elimina para todos se
// conserva y se marca como eliminado; uno editado guarda sus versiones anteriores.
// Apagado: se hace como en el celular (el eliminado pierde el contenido, la edición
// pisa el texto). Es una definición legal de la concesionaria: ver docs/PRIVACIDAD.md.
export const CONSERVAR_ELIMINADOS = encendido(env.WA_CONSERVAR_ELIMINADOS, true)
export const CONSERVAR_EDICIONES = encendido(env.WA_CONSERVAR_EDICIONES, true)

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
// Tope de espacio en R2 (GB). El plan gratuito incluye 10 GB: por defecto 9, para dejar
// margen. Al 85 % se borran los archivos más viejos; nunca se sube algo que lo pase. 0: sin tope.
const limiteGb = env.WA_R2_LIMITE_GB == null || String(env.WA_R2_LIMITE_GB).trim() === '' ? 9 : Number(env.WA_R2_LIMITE_GB)
// Un valor que no es un número no apaga el tope: vale el de por defecto. Solo 0 lo apaga.
export const R2_LIMITE_BYTES = (Number.isFinite(limiteGb) && limiteGb >= 0 ? limiteGb : 9) * 1024 ** 3

/* ---------------- Respaldo de la sesión ---------------- */

// Con esta clave, la sesión de WhatsApp (data/sesion) y los .env se respaldan cifrados en
// R2 (respaldo/). Con la misma clave, `npm run restaurar` los recupera en una PC nueva y
// la línea conecta sin escanear el QR. La clave NO se guarda en el respaldo: va en un
// gestor de contraseñas. Ver docs/OPERACION.md.
export const BACKUP_CLAVE = env.WA_BACKUP_CLAVE || ''

/* ---------------- Registro y alertas ---------------- */

// Registro de actividad en archivos (data/logs/AAAA-MM-DD.log), uno por día.
export const LOG_DIR = path.join(DATA_DIR, 'logs')
export const LOG_DIAS = Number(env.WA_LOG_DIAS) || 30

// A quién avisar si la línea se cae, se desvincula o el celular deja de responder.
export const ALERTA_EMAILS = lista(env.WA_ALERTA_EMAIL)
export const RESEND_API_KEY = env.RESEND_API_KEY || ''
export const ALERTA_REMITENTE = env.WA_ALERTA_REMITENTE || 'Alertas Neifert <alertas@neifertautomotores.com>'
// Además del email (o en su lugar), un POST con { titulo, detalle } a esta dirección:
// sirve para ntfy, un bot de Telegram, Slack, etc.
export const ALERTA_WEBHOOK = env.WA_ALERTA_WEBHOOK || ''
// Minutos desconectada antes de avisar.
export const ALERTA_MINUTOS = Number(env.WA_ALERTA_MINUTOS) || 15
// Días sin señales del celular antes de avisar (WhatsApp desvincula a los 14).
export const ALERTA_CELULAR_DIAS = Number(env.WA_ALERTA_CELULAR_DIAS) || 10

/* ---------------- Login con el CRM ---------------- */

export const SUPABASE_URL = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
export const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''
// Solo del lado del servidor: lee crm.usuarios sin depender de la sesión.
export const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || ''
// Adónde mandar al que entra sin sesión.
export const CRM_URL = (env.CRM_URL || '').replace(/\/+$/, '')

// Quién puede hacer qué (roles del CRM: admin, dueno, vendedor):
//   WHATSAPP_ROLES        entran a la bandeja y escriben
//   WHATSAPP_ROLES_LINEA  además ven el QR, vinculan, desvinculan y cambian preferencias
//   WHATSAPP_ROLES_LECTURA entran solo a mirar: no pueden escribir ni cambiar nada
export const ROLES_WHATSAPP = lista(env.WHATSAPP_ROLES ?? 'admin,dueno,vendedor')
export const ROLES_LINEA = lista(env.WHATSAPP_ROLES_LINEA ?? 'admin,dueno')
export const ROLES_LECTURA = lista(env.WHATSAPP_ROLES_LECTURA ?? '')

/**
 * WHATSAPP_NUMERO tal como está ahora en el entorno o en los .env (se relee del archivo, para
 * avisar si alguien lo cambia con el servidor andando).
 */
export function numeroEnArchivos() {
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

/**
 * La línea (número de WhatsApp, con código de país) con la que corre el servidor. Es además
 * la "llave" de los datos: cada número tiene sus propios chats y mensajes en Supabase
 * (columna `linea`), sus archivos en R2 (lineas/<número>/…) y su sesión y diario en el disco
 * (DATA_DIR/lineas/<número>). Así se puede probar con un número y usar otro en producción
 * sin mezclar ni borrar nada.
 *
 * Se fija al arrancar: para cambiar de línea se reinicia el servidor (la app de escritorio
 * lo hace sola). Si se escanea el QR con otro celular, se desvincula solo.
 */
export const LINEA = numeroEnArchivos()
export const numeroLinea = () => LINEA
// Sin número: sus datos van aparte, para no mezclarse con los de ninguna línea.
export const CLAVE_LINEA = LINEA || 'sin-numero'
export const LINEA_DIR = path.join(DATA_DIR, 'lineas', CLAVE_LINEA)
// Firma de la cookie de sesión. Si no se define, se genera una y se guarda en DATA_DIR.
export const SESION_SECRETO = env.SESION_SECRETO || ''
export const SESION_HORAS = Number(env.SESION_HORAS) || 12

// WHATSAPP_LOGIN=off lo apaga, pero solo se acepta si el panel escucha únicamente en esta PC.
export const LOGIN_CONFIGURADO =
  env.WHATSAPP_LOGIN !== 'off' && Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY)
export const SOLO_ESTA_PC = ['127.0.0.1', 'localhost', '::1'].includes(HOST)

// Sitios que pueden mostrar el panel dentro de una página (el CRM lo embebe) y mandarle
// la sesión. Sale de CRM_URL; en esta PC también se acepta el CRM de desarrollo.
// Con y sin "www.": el dominio redirige uno al otro, pero mejor aceptar los dos.
const conYSinWww = (origen) => {
  const u = new URL(origen)
  const otro = u.hostname.startsWith('www.') ? u.hostname.slice(4) : `www.${u.hostname}`
  return [u.origin, `${u.protocol}//${otro}${u.port ? `:${u.port}` : ''}`]
}
export const ORIGENES_CRM = [
  ...(CRM_URL && !/^(localhost|127\.0\.0\.1)$/.test(new URL(CRM_URL).hostname) ? conYSinWww(CRM_URL) : CRM_URL ? [new URL(CRM_URL).origin] : []),
  ...(SOLO_ESTA_PC ? ['http://localhost:*', 'http://127.0.0.1:*'] : []),
]
