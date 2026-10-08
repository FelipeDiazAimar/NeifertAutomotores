/*
 * Sube a Supabase todo lo que hay en los archivos locales (data/): chats, contactos,
 * mensajes y el estado (archivados, fijados, silenciados, LIDs, preferencias).
 *
 * Uso, con el servidor APAGADO (para que los archivos no cambien mientras se leen):
 *   npm run importar
 *
 * Se puede correr más de una vez: lo que ya está en la base se actualiza, no se duplica.
 * También borra los chats de ejemplo que crea supabase/whatsapp_schema.sql.
 */
process.env.ALMACEN = 'local' // leer de los archivos, no de la base

const { WA_DATABASE_URL } = await import('../src/config.js')
if (!WA_DATABASE_URL) {
  console.error('Falta WA_DATABASE_URL en Whatsapp/servidor/.env')
  process.exit(1)
}
const { volcarLocal } = await import('../src/almacen.js')
const nube = await import('../src/nube.js')
const { default: pg } = await import('pg')

const EJEMPLOS = ['5493564000001@s.whatsapp.net', '120363000000000001@g.us']
const CONTACTOS_EJEMPLO = ['5493564000001@s.whatsapp.net', '5493564000002@s.whatsapp.net']

const db = new pg.Client({ connectionString: WA_DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
const ej = await db.query('delete from wa.chats where jid = any($1)', [EJEMPLOS])
await db.query('delete from wa.contactos where jid = any($1)', [CONTACTOS_EJEMPLO])
if (ej.rowCount) console.log(`Chats de ejemplo borrados: ${ej.rowCount}`)

const { estado, mensajes } = volcarLocal()
let total = 0
for (const porId of mensajes.values()) total += porId.size
console.log(`Leído de los archivos: ${Object.keys(estado.chats).length} chats · ${total} mensajes · ${Object.keys(estado.contactos).length} contactos`)

const inicio = Date.now()
const r = await nube.importar(estado, mensajes)
console.log(`Subido a Supabase en ${((Date.now() - inicio) / 1000).toFixed(1)} s: ${r.chats} chats · ${r.mensajes} mensajes · ${r.contactos} contactos`)

const en = await db.query(`
  select (select count(*) from wa.chats)::int as chats,
         (select count(*) from wa.mensajes)::int as mensajes,
         (select count(*) from wa.contactos)::int as contactos,
         (select count(*) from wa.chats where archivado)::int as archivados`)
const e = en.rows[0]
console.log(`Ahora en la base: ${e.chats} chats (${e.archivados} archivados) · ${e.mensajes} mensajes · ${e.contactos} contactos`)
await db.end()
await nube.cerrar()
