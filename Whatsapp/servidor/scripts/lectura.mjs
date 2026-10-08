/*
 * Ver, ocultar o mostrar los chats de la vista sin conexión del CRM (los que se leen de la
 * base cuando la PC servidor está apagada). Lo usa la app de escritorio, también con el
 * servidor apagado: habla directo con la base.
 *
 *   node scripts/lectura.mjs ver
 *   node scripts/lectura.mjs ocultar
 *   node scripts/lectura.mjs mostrar
 *
 * Contesta una sola línea JSON: { ok, habilitada, motivo, por, ts } o { ok: false, error }.
 */
const accion = process.argv[2] || 'ver'
const responder = (datos, codigo = 0) => {
  process.stdout.write(`${JSON.stringify(datos)}\n`)
  process.exit(codigo)
}

try {
  if (!['ver', 'ocultar', 'mostrar'].includes(accion)) responder({ ok: false, error: `Acción desconocida: ${accion}` }, 2)
  const { ALMACEN, LINEA, WA_DATABASE_URL } = await import('../src/config.js')
  if (ALMACEN !== 'supabase' || !WA_DATABASE_URL) {
    responder({ ok: false, error: 'La configuración no guarda los chats en la base (falta WA_DATABASE_URL): no hay vista sin conexión.' }, 1)
  }
  if (!LINEA) responder({ ok: false, error: 'Falta el número de la línea: iniciá el servidor una vez con el número.' }, 1)
  const nube = await import('../src/nube.js')
  const r = accion === 'ver' ? await nube.verLectura() : await nube.cambiarLectura(accion === 'mostrar')
  await nube.cerrar().catch(() => {})
  responder({ ok: true, linea: LINEA, ...r })
} catch (err) {
  responder({ ok: false, error: err.message }, 1)
}
