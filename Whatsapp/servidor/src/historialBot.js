/*
 * La conversación de un contacto para el bot: lo que escribió el cliente, lo que contestaron los asesores desde esta línea
 * y lo que contestó Sofía, todo junto y en orden. Así Sofía sabe de qué se habló aunque no haya sido con ella.
 * Sin dependencias: se prueba sola.
 */

const MAX_TEXTO = 600

/** Cómo se cuenta un mensaje sin texto (foto, audio...). null si no hay que contarlo. */
function textoDe(m) {
  const t = String(m.texto ?? '').trim()
  if (t) return t.slice(0, MAX_TEXTO)
  if (!m.tipo || m.tipo === 'texto' || m.tipo === 'sistema' || m.tipo === 'desconocido') return null
  return `[${m.tipo}]`
}

/**
 * @param {object[]} mensajes  los del chat (almacen): { ts (segundos), deMi, tipo, texto, eliminado, sofia? }
 * @param {{ limite?: number, dias?: number, ahora?: number }} opciones  los últimos `limite` mensajes de los últimos `dias` días
 * @returns {{ rol: 'cliente'|'asesor'|'sofia', texto: string, ts: number }[]}  ts en ms
 */
export function historialParaBot(mensajes, { limite = 30, dias = 30, ahora = Date.now() } = {}) {
  const desde = ahora - dias * 86400000
  const salida = []
  for (const m of [...(mensajes || [])].sort((a, b) => a.ts - b.ts)) {
    if (m.eliminado) continue
    const ts = Number(m.ts) * 1000
    if (!Number.isFinite(ts) || ts < desde) continue
    const texto = textoDe(m)
    if (!texto) continue
    // Los de Sofía llevan su propio rol; el resto, del cliente o de una persona del negocio.
    const rol = m.sofia ? (m.sofia.rol === 'bot' ? 'sofia' : 'cliente') : m.deMi ? 'asesor' : 'cliente'
    salida.push({ rol, texto, ts })
  }
  return salida.slice(-Math.min(Math.max(Math.trunc(limite) || 30, 1), 60))
}
