/*
 * Cuántas respuestas tendría que dar el asistente con IA (Sofía) fuera del horario de atención, con los
 * mensajes reales de la línea. Solo lee: cuenta mensajes entrantes por hora, sin mirar su contenido.
 *
 *   npm run estadisticas-ia                         últimos 180 días de la línea de este servidor
 *   npm run estadisticas-ia -- --dias=90 --linea=5493564XXXXXX
 *
 * Necesita WA_DATABASE_URL (o WA_SUPABASE_URL) en Whatsapp/servidor/.env: la base del WhatsApp, que no es la del CRM.
 * Compara contra IA_CUPO_MENSUAL (1500) y IA_POR_MINUTO (20) del servidor de licencias (se pueden pasar con --cupo= y --por-minuto=).
 */
import pg from 'pg'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)
const dias = Number(args.dias) > 0 ? Number(args.dias) : 180

const { WA_DATABASE_URL } = await import('../src/config.js')
if (!WA_DATABASE_URL) {
  console.error('Falta WA_DATABASE_URL (la base del WhatsApp) en Whatsapp/servidor/.env.')
  process.exit(1)
}
const { CONSULTA_ENTRANTES, calcular, informe } = await import('../src/estadisticasIA.js')

const pool = new pg.Pool({ connectionString: WA_DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 })
try {
  let linea = args.linea && String(args.linea)
  if (!linea) {
    // Sin --linea: la que más mensajes recibió en el período.
    const { rows } = await pool.query(
      "select linea from wa.mensajes where not de_mi and ts >= now() - ($1::int * interval '1 day') group by linea order by count(*) desc limit 1",
      [dias],
    )
    linea = rows[0]?.linea
  }
  if (!linea) {
    console.error('No encontré mensajes en ese período (probá con --linea=NUMERO o más --dias).')
    process.exit(1)
  }
  const { rows } = await pool.query(CONSULTA_ENTRANTES, [linea, dias])
  console.log(`Línea ${linea}\n`)
  const resultado = calcular(rows.map((r) => ({ chat: r.chat_jid, ts: r.ts })), { dias })
  console.log(informe(resultado, { dias, cupoMensual: Number(args.cupo) || 1500, porMinuto: Number(args['por-minuto']) || 20 }))
  console.log('\nPor mes (respuestas fuera de horario):')
  for (const [mes, n] of Object.entries(resultado.porMes)) console.log(`  ${mes}: ${n}`)
} finally {
  await pool.end()
}
