/*
 * Historial de respaldos, para verlo en el CRM (Admin → Respaldos de WhatsApp). Dos listas,
 * guardadas en wa.estado (la base, que el CRM lee) y, sin base (modo local), en un archivo:
 *   - respaldo_local: los que se bajan a mano con "Exportar todos los chats".
 *   - respaldo_nube: los automáticos a R2 (los que salieron bien y los que fallaron).
 * Anotar nunca tira: si la base falla, el respaldo igual se hizo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ALMACEN, LINEA_DIR } from './config.js'
import { guardarEstadoNube, leerEstadoNube } from './nube.js'

export const MAX_HISTORIAL = 120

/** Un valor de estado con su lugar: la base en producción, un archivo de la línea en modo local. */
export function almacenDeEstado(clave) {
  const archivo = path.join(LINEA_DIR, `${clave.replace(/_/g, '-')}.json`)
  return {
    async leer() {
      if (ALMACEN === 'supabase') return leerEstadoNube(clave)
      try {
        return JSON.parse(fs.readFileSync(archivo, 'utf8'))
      } catch {
        return null
      }
    },
    async guardar(valor) {
      if (ALMACEN === 'supabase') return guardarEstadoNube(clave, valor)
      fs.mkdirSync(path.dirname(archivo), { recursive: true })
      fs.writeFileSync(archivo, JSON.stringify(valor, null, 1))
    },
  }
}

const nube = almacenDeEstado('respaldo_nube')

/** Suma un intento de respaldo en la nube (bueno o fallado) al historial. */
export async function anotarRespaldoNube(registro, { almacen = nube } = {}) {
  try {
    const e = (await almacen.leer()) || {}
    await almacen.guardar({ ...e, historial: [registro, ...(e.historial || [])].slice(0, MAX_HISTORIAL) })
  } catch {
    /* el respaldo ya se hizo: solo no queda en el historial */
  }
}
