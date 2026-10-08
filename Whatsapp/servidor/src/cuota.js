/*
 * Tope de espacio en Cloudflare R2: que el bucket NUNCA pase del plan gratuito (10 GB).
 *
 *   - Lleva la cuenta de lo que ocupa el bucket: lo mide al arrancar y cada 6 horas
 *     (listar el bucket) y suma cada archivo que se sube.
 *   - Tope duro: no se sube nada que haga pasar WA_R2_LIMITE_GB (9 GB por defecto, para
 *     dejar margen). Lo chico y vital (respaldo de la sesión, paquetes del servidor) pasa
 *     siempre: pesa unos pocos MB.
 *   - Limpieza preventiva: whatsapp.js borra los archivos más viejos al llegar al 85 %
 *     (ver liberarEspacio), así el tope duro casi nunca hace falta.
 *
 * Sin R2 (archivos en el disco) no limita nada.
 */
import { ARCHIVOS_EN_R2, R2_LIMITE_BYTES } from './config.js'

export const LIMITE = R2_LIMITE_BYTES
export const UMBRAL_LIMPIEZA = 0.85 // a partir de acá se borran los archivos más viejos
export const OBJETIVO_LIMPIEZA = 0.75 // hasta bajar a esto
const SIEMPRE = /^(respaldo|app)\//

let usado = null // bytes; null hasta la primera medición
let medidoEn = 0
let midiendo = null

export const activa = () => ARCHIVOS_EN_R2 && LIMITE > 0
export const estadoCuota = () => ({ activa: activa(), usado, limite: LIMITE, medidoEn })
export const fraccion = () => (usado == null || !LIMITE ? 0 : usado / LIMITE)

/** Mide lo que ocupa el bucket entero. `listar(prefijo)` viene de archivos.js. */
export function medir(listar) {
  if (!activa()) return Promise.resolve(null)
  midiendo ??= listar('')
    .then((todos) => {
      usado = todos.reduce((n, a) => n + (a.tamano || 0), 0)
      medidoEn = Date.now()
      return usado
    })
    .finally(() => (midiendo = null))
  return midiendo
}

/** Antes de subir: corta si el archivo haría pasar el tope. */
export function permitir(clave, bytes) {
  if (!activa() || SIEMPRE.test(clave) || usado == null) return
  if (usado + bytes > LIMITE) {
    const gb = (n) => (n / 1024 ** 3).toFixed(2)
    throw Object.assign(new Error(`Sin espacio en R2: hay ${gb(usado)} GB usados y el tope es ${gb(LIMITE)} GB`), { code: 'SIN_ESPACIO', status: 507 })
  }
}

/** Después de subir o borrar: ajusta la cuenta (la medición periódica corrige lo que se desvíe). */
export function sumar(bytes) {
  if (usado != null) usado = Math.max(0, usado + bytes)
}
