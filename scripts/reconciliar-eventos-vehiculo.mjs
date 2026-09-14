import pg from 'pg'

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const { rows: distintos } = await client.query(
  'select distinct vehiculo_id from public.eventos_vehiculo where vehiculo_id is not null',
)

let actualizados = 0
let filas = 0
let ambiguos = 0
let sinMatch = 0

for (const { vehiculo_id: viejoId } of distintos) {
  const { rows: pub } = await client.query('select marca, modelo, km from public.vehiculos where id = $1', [viejoId])
  if (!pub.length) { sinMatch++; continue }
  const { marca, modelo, km } = pub[0]

  const { rows: crm } = await client.query(
    'select id from crm.vehiculos where lower(marca) = lower($1) and lower(modelo) = lower($2) and km = $3',
    [marca, modelo, km],
  )
  if (crm.length !== 1) {
    if (crm.length > 1) ambiguos++
    else sinMatch++
    continue
  }

  const nuevoId = crm[0].id
  const { rowCount } = await client.query(
    'update public.eventos_vehiculo set vehiculo_id = $1 where vehiculo_id = $2',
    [nuevoId, viejoId],
  )
  actualizados++
  filas += rowCount
}

console.log(`Vehículos remapeados: ${actualizados} (${filas} filas de eventos). Ambiguos: ${ambiguos}. Sin match: ${sinMatch}.`)
await client.end()
