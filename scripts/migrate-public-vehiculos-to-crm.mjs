import pg from 'pg'

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const { rows: publicos } = await client.query(
  `select * from public.vehiculos where estado = 'disponible' and coalesce(oculto, false) = false`
)

let creados = 0
let actualizados = 0

for (const v of publicos) {
  const { rows: existentes } = await client.query(
    `select id from crm.vehiculos where lower(marca) = lower($1) and lower(modelo) = lower($2)
     and coalesce(patente,'') = '' limit 1`,
    [v.marca, v.modelo]
  )
  let vehiculoId = existentes[0]?.id

  if (!vehiculoId) {
    const { rows: ins } = await client.query(
      `insert into crm.vehiculos (marca, modelo, version, anio, km, transmision, color, moneda,
         precio_contado, precio_usd, categoria, descripcion, es_nuevo, combustible, estado, publicado)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'disponible', true)
       returning id`,
      [v.marca, v.modelo, v.version, v.anio, v.km, v.transmision, v.color, v.moneda,
       v.precio, v.precio_usd, v.categoria, v.descripcion, v.es_nuevo, v.combustible]
    )
    vehiculoId = ins[0].id
    creados++
  } else {
    await client.query(
      `update crm.vehiculos set categoria=$1, descripcion=$2, es_nuevo=$3, combustible=$4, precio_usd=$5, publicado=true
       where id=$6`,
      [v.categoria, v.descripcion, v.es_nuevo, v.combustible, v.precio_usd, vehiculoId]
    )
    actualizados++
  }

  const imagenes = [v.imagen_principal, ...(Array.isArray(v.imagenes) ? v.imagenes : [])].filter(Boolean)
  const { rows: portadaExistente } = await client.query(
    `select 1 from crm.vehiculo_fotos where vehiculo_id = $1 and es_portada = true`,
    [vehiculoId]
  )
  let yaTienePortada = portadaExistente.length > 0
  for (const [i, url] of imagenes.entries()) {
    const { rows: yaExiste } = await client.query(
      `select 1 from crm.vehiculo_fotos where vehiculo_id = $1 and url = $2`,
      [vehiculoId, url]
    )
    if (yaExiste.length) continue
    const esPortada = !yaTienePortada && i === 0
    await client.query(
      `insert into crm.vehiculo_fotos (vehiculo_id, url, orden, es_portada)
       values ($1, $2, $3, $4)`,
      [vehiculoId, url, i, esPortada]
    )
    if (esPortada) yaTienePortada = true
  }
}

console.log(`Migración de public.vehiculos → crm.vehiculos: ${creados} creados, ${actualizados} actualizados (de ${publicos.length} candidatos).`)
await client.end()
