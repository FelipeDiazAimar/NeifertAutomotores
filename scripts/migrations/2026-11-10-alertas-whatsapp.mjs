import pg from 'pg'
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
await client.query('alter table crm.usuarios add column if not exists telefono text;')
await client.query(
  'alter table crm.alertas add column if not exists notificado_whatsapp boolean not null default false;'
)
await client.end()
console.log('Columnas de WhatsApp aplicadas.')
