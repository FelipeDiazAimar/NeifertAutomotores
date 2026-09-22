import pg from 'pg'

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
await client.query(`
  update crm.roles
  set vistas_default = vistas_default || array['alertas']
  where not (vistas_default @> array['alertas'])
`)
const { rows } = await client.query(`select rol, vistas_default from crm.roles order by rol`)
console.log(JSON.stringify(rows, null, 2))
await client.end()
