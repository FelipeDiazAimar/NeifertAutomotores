/*
 * Registros para la ventana "Registros" de la app: junta lo del servidor de WhatsApp
 * (data/logs/AAAA-MM-DD.log, una línea JSON por evento), lo de la app y lo del túnel
 * (app.log), y a cada error conocido le agrega qué significa y qué hacer.
 */
const fs = require('node:fs')
const path = require('node:path')

const dos = (n) => String(n).padStart(2, '0')
const diaDe = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`

/**
 * Errores y avisos conocidos: con qué texto aparecen, de dónde vienen, qué significan y qué
 * hacer. El primero que coincide gana (los más específicos van primero).
 */
const CONOCIDOS = [
  { re: /no es (el número|el de la concesionaria)|número que no es/i, origen: 'WhatsApp', que: 'Se escaneó el QR con el celular de otro número. El servidor lo desvinculó solo.', hacer: 'Escaneá con el celular del número que figura en la app, o tocá "Cambiar número".' },
  { re: /\(440\)|misma sesi[oó]n/i, origen: 'WhatsApp', que: 'Hay otro servidor usando esta misma línea (otra PC con la app, o un "npm start" en una PC de desarrollo).', hacer: 'Dejá prendido uno solo. El de esta PC reintenta solo en unos minutos.' },
  { re: /\(403\)|rechaz[oó] la conexi[oó]n/i, origen: 'WhatsApp', que: 'WhatsApp rechazó la cuenta: puede ser una restricción o un bloqueo del número.', hacer: 'Revisá el celular de la línea. Ver "Riesgo de baneo y Plan B" en Whatsapp/docs/OPERACION.md.' },
  { re: /\(405\)|versi[oó]n del protocolo/i, origen: 'WhatsApp', que: 'WhatsApp pidió una versión más nueva del protocolo.', hacer: 'Se actualiza sola. Si se repite, publicá una versión nueva del servidor (npm run publicar).' },
  { re: /sesi[oó]n da[ñn]ada|\(500\)/i, origen: 'WhatsApp', que: 'Las claves de la sesión de WhatsApp se dañaron.', hacer: 'Ícono → "Restaurar la sesión desde el respaldo…", o "Cambiar número" y volver a escanear el QR.' },
  { re: /sesi[oó]n se cerr[oó]|se desvincul/i, origen: 'WhatsApp', que: 'La línea se desvinculó (desde el celular, el panel, o por número equivocado).', hacer: 'Escaneá el QR de nuevo con el celular de la línea.' },
  { re: /Conexi[oó]n perdida|\(408\)|\(428\)|\(503\)|QR refs attempts ended/i, origen: 'WhatsApp', que: 'Se cortó la conexión con WhatsApp, o pasó un rato sin que nadie escanee el QR.', hacer: 'Se reintenta solo. Si sigue, revisá que la PC tenga internet.' },
  { re: /celular no (responde|da se[ñn]ales)|sin se[ñn]ales/i, origen: 'Celular', que: 'El celular de la línea no responde (sin internet, apagado o sin abrir WhatsApp hace días).', hacer: 'Abrí WhatsApp en el celular con internet. Si pasan 14 días sin abrirlo, WhatsApp desvincula la línea.' },
  { re: /EADDRINUSE|puerto \d+ est[aá] ocupado/i, origen: 'Servidor', que: 'El puerto 3100 está ocupado: ya hay otro servidor abierto en esta PC (por ejemplo un "npm start").', hacer: 'Cerrá el otro servidor y tocá "Reiniciar el servidor" desde el ícono.' },
  { re: /password authentication|WA_DATABASE_URL|almac[eé]n desde Supabase|ECONNREFUSED|getaddrinfo|Supabase respondi[oó] 5/i, origen: 'Supabase', que: 'No se pudo hablar con la base de mensajes (Supabase "Whatsapp Neifert").', hacer: 'Revisá WA_DATABASE_URL (sobre todo la contraseña) en la configuración y que la PC tenga internet.' },
  { re: /Sin espacio en R2|tope de R2|archivos viejos/i, origen: 'Cloudflare R2', que: 'El bucket llegó al tope de espacio y se borraron los archivos más viejos.', hacer: 'Es normal. Si querés guardar más, subí WA_R2_LIMITE_GB (el plan gratis incluye 10 GB).' },
  { re: /InvalidAccessKeyId|SignatureDoesNotMatch|AccessDenied|NoSuchBucket|R2 respondi[oó]|traer el archivo de R2/i, origen: 'Cloudflare R2', que: 'Cloudflare R2 rechazó el pedido: credenciales o bucket mal configurados.', hacer: 'Revisá WA_R2_BUCKET, WA_R2_ENDPOINT, WA_R2_ACCESS_KEY_ID y WA_R2_SECRET_ACCESS_KEY.' },
  { re: /verificar (la sesi[oó]n|tu usuario) con el CRM|login con el CRM sin configurar/i, origen: 'CRM', que: 'No se pudo validar a los usuarios con el CRM.', hacer: 'Revisá SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY en la configuración.' },
  { re: /Respaldo de la sesi[oó]n apagado/i, origen: 'Respaldo', que: 'No hay respaldo de la sesión de WhatsApp: si la PC se rompe, habría que volver a escanear el QR.', hacer: 'Agregá WA_BACKUP_CLAVE a la configuración (ícono → "Cambiar configuración…").' },
  { re: /respaldar la sesi[oó]n/i, origen: 'Respaldo', que: 'Falló el respaldo cifrado de la sesión en R2.', hacer: 'Revisá las credenciales de R2. Se reintenta solo.' },
  { re: /Alertas sin destino/i, origen: 'Alertas', que: 'Nadie recibe avisos si la línea se cae.', hacer: 'Agregá WA_ALERTA_EMAIL y RESEND_API_KEY a la configuración.' },
  { re: /no se pudo descargar un archivo|ya no tiene este archivo|enlace del archivo|no entreg[oó] el archivo/i, origen: 'WhatsApp', que: 'WhatsApp ya no tiene ese archivo (es viejo o se borró del celular).', hacer: 'No se puede recuperar. No afecta al resto de los chats.' },
  { re: /Cambi[oó] WHATSAPP_NUMERO/i, origen: 'Servidor', que: 'Cambió el número en un .env con el servidor andando.', hacer: 'Reiniciá el servidor para pasar a esa línea.' },
  { re: /El servidor se cerr[oó] \(c[oó]digo/i, origen: 'App', que: 'El servidor se cerró de golpe. La app lo vuelve a levantar sola.', hacer: 'Si se repite, mirá el error de justo antes: ahí está la causa.' },
  { re: /No se pudo actualizar/i, origen: 'Actualización', que: 'No se pudo bajar o instalar la versión nueva del servidor.', hacer: 'Se reintenta en 30 minutos. Se sigue usando la versión actual.' },
  { re: /falla al arrancar|falló; se volvió a|se cae al arrancar/i, origen: 'Actualización', que: 'La versión nueva del servidor no arrancaba y se volvió a la anterior.', hacer: 'Corregí el problema y publicá otra versión.' },
  { re: /Unauthorized|invalid token|failed to unmarshal|Invalid tunnel secret/i, origen: 'Túnel', que: 'Cloudflare rechazó el token del túnel.', hacer: 'Revisá WA_TUNEL_TOKEN (copiá solo el token, sin "cloudflared service install").' },
  { re: /Falta cloudflared/i, origen: 'Túnel', que: 'No está el programa del túnel en la instalación.', hacer: 'Reinstalá la app.' },
  { re: /(dial tcp|connection refused).*3100|Unable to reach the origin/i, origen: 'Túnel', que: 'El túnel no llega al servidor de esta PC.', hacer: 'Revisá que el servidor esté iniciado (pantalla de la app).' },
  { re: /failed to connect to the edge|connection.*(reset|timed out)|Retrying connection/i, origen: 'Túnel', que: 'El túnel no se pudo conectar con Cloudflare (internet o firewall).', hacer: 'Se reintenta solo. Revisá la conexión de la PC.' },
]

/** De dónde viene un registro que no está en la lista de conocidos. */
function origenDe(texto) {
  if (/supabase|base de|almac[eé]n|mensajes guardados/i.test(texto)) return 'Supabase'
  if (/\bR2\b|bucket|archivos/i.test(texto)) return 'Cloudflare R2'
  if (/whatsapp|QR|l[ií]nea|grupos|chats|contactos/i.test(texto)) return 'WhatsApp'
  if (/CRM|usuario|sesi[oó]n del panel/i.test(texto)) return 'CRM'
  return 'Servidor'
}

function explicar(item) {
  const texto = `${item.texto} ${item.detalle || ''}`
  const c = CONOCIDOS.find((k) => k.re.test(texto))
  return { ...item, origen: item.origen || c?.origen || origenDe(item.texto), que: c?.que || null, hacer: c?.hacer || null }
}

/** Registros del servidor de los últimos `dias` días (una línea JSON por evento). */
function deServidor(dirLogs, dias) {
  const items = []
  for (let i = dias - 1; i >= 0; i--) {
    const archivo = path.join(dirLogs, `${diaDe(new Date(Date.now() - i * 86400e3))}.log`)
    let texto
    try {
      texto = fs.readFileSync(archivo, 'utf8')
    } catch {
      continue
    }
    for (const linea of texto.split('\n')) {
      if (!linea.trim()) continue
      try {
        const e = JSON.parse(linea)
        items.push({ ts: e.ts, nivel: e.nivel || 'info', texto: e.texto || '', detalle: e.detalle || '', quien: e.quien || null, fuente: 'servidor' })
      } catch {}
    }
  }
  return items
}

/**
 * Lo de la app y del túnel (app.log). Lo que el servidor escribe en su consola ya está en
 * sus propios registros, salvo lo que no pasó por ellos (errores sin atrapar, avisos de
 * Node): eso sí se muestra. Del túnel solo los errores, avisos y "conectado".
 */
function deApp(archivoApp) {
  let texto
  try {
    texto = fs.readFileSync(archivoApp, 'utf8')
  } catch {
    return []
  }
  const items = []
  for (const linea of texto.split('\n').slice(-3000)) {
    const m = /^\[(\d{1,2})\/(\d{1,2})\/(\d{4}),? (\d{1,2}):(\d{2}):(\d{2})\] (.*)$/.exec(linea.trim())
    if (!m) continue
    const [, dia, mes, anio, h, min, s, cuerpo] = m
    const ts = new Date(+anio, +mes - 1, +dia, +h, +min, +s).getTime()
    if (cuerpo.startsWith('servidor: ')) {
      const resto = cuerpo.slice(10)
      if (/^\[\d{2}:\d{2}:\d{2}\]/.test(resto)) continue // ya está en los registros del servidor
      items.push({ ts, nivel: /error|warn|fall/i.test(resto) ? 'error' : 'aviso', texto: resto, detalle: '', fuente: 'consola', origen: 'Servidor' })
    } else if (cuerpo.startsWith('túnel: ')) {
      const resto = cuerpo.slice(7)
      const nivel = /\bERR\b/.test(resto) ? 'error' : /\bWRN\b/.test(resto) ? 'aviso' : /Registered tunnel connection/.test(resto) ? 'ok' : null
      if (!nivel) continue
      const limpio = resto.replace(/^\S+Z\s+(INF|WRN|ERR)\s+/, '')
      items.push({ ts, nivel, texto: nivel === 'ok' ? 'Túnel conectado a Cloudflare' : limpio, detalle: nivel === 'ok' ? limpio : '', fuente: 'tunel', origen: 'Túnel' })
    } else {
      const nivel = /no se pudo|se cerr[oó]|falt|falla|error/i.test(cuerpo) ? 'aviso' : 'info'
      items.push({ ts, nivel, texto: cuerpo, detalle: '', fuente: 'app', origen: 'App' })
    }
  }
  return items
}

/**
 * Todo junto, lo más nuevo primero. Los mismos mensajes seguidos (cientos de "no se pudo
 * descargar un archivo", por ejemplo) se juntan en uno con la cantidad (`veces`) y desde
 * cuándo (`desde`), así no tapan lo demás.
 */
function leerRegistros({ dirLogs, archivoApp, dias = 2, limite = 600 }) {
  const todos = [...deServidor(dirLogs, dias), ...deApp(archivoApp)].sort((a, b) => b.ts - a.ts)
  const juntos = []
  for (const r of todos) {
    const prev = juntos.at(-1)
    if (prev && prev.texto === r.texto && prev.nivel === r.nivel && prev.fuente === r.fuente) {
      prev.veces++
      prev.desde = r.ts
      continue
    }
    if (juntos.length >= limite) break
    juntos.push({ ...r, veces: 1, desde: r.ts })
  }
  return juntos.map(explicar)
}

module.exports = { leerRegistros, explicar }
