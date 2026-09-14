/* Canal en vivo hacia el navegador (Server-Sent Events) + registro de actividad. */

const clientes = new Set()
const registro = []

export function suscribir(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.write('retry: 2000\n\n')
  clientes.add(res)
  req.on('close', () => clientes.delete(res))
}

export function emitir(evento, datos) {
  const payload = `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`
  for (const res of clientes) res.write(payload)
}

/** nivel: 'ok' | 'info' | 'aviso' | 'error' */
export function log(nivel, texto, detalle = '') {
  const item = { ts: Date.now(), nivel, texto, detalle }
  registro.unshift(item)
  if (registro.length > 300) registro.pop()
  const hora = new Date().toLocaleTimeString('es-AR')
  console.log(`[${hora}] ${texto}${detalle ? ` · ${detalle}` : ''}`)
  emitir('log', item)
}

export const ultimosLogs = () => registro

// Mantiene viva la conexión SSE detrás de proxies que cortan conexiones inactivas.
setInterval(() => {
  for (const res of clientes) res.write(': ping\n\n')
}, 25000).unref()
