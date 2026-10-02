import pg from 'pg'

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

// 1) Filas de crm.vehiculos que YA correspondían a un candidato de
//    public.vehiculos (misma marca/modelo/km) pero se habían quedado con
//    publicado=false porque el matching original solo miraba marca+modelo.
const marcarPublicados = [
  '0208f01c-b2d7-4712-937f-ce6dc82e2725', // Fiat Cronos km 81000
  '7d570e1f-e033-4ea4-a280-d131c57951af', // Ford Ranger km 17000
  '1979fbc9-69d6-4be6-8ee3-c9427262671a', // Renault Clio Mio km 117000
  '40c116f1-7c71-4d80-bc1a-245e185acb89', // Toyota Hilux km 62000
  'a5bfd084-e36a-4650-9e5e-c28561a9938f', // Toyota SW4 km 350000
  '0a270215-89fe-4522-9d50-0a68aa03de59', // Volkswagen Suran km 93000
]
await client.query(`update crm.vehiculos set publicado = true where id = any($1::uuid[])`, [marcarPublicados])
console.log(`publicado=true en ${marcarPublicados.length} filas ya existentes.`)

// 2) Fila que el matching por marca+modelo tocó por error (no corresponde a
//    ningún candidato real de public.vehiculos) — se revierte su publicación.
await client.query(`update crm.vehiculos set publicado = false where id = $1`, [
  '8e3c36b7-83e3-4abb-9998-8f7af4eb7f05', // Ford Ranger km 3000 (auto distinto, sin relación)
])
console.log('publicado=false revertido en 1 fila mal matcheada.')

// 3) Candidatos de public.vehiculos que no tenían NINGÚN equivalente en
//    crm.vehiculos (unidades genuinamente distintas, confirmadas por
//    id_externo/versión propios) — se insertan de cero, con sus fotos.
const faltantes = ['476a4b24-88f2-46f2-b128-a15d11b9afcf', '90750c7c-f078-4e0b-8ee0-68f8795ac896',
  '0ca74ab8-3021-44d8-b089-a4c7c5ae063c', 'ee35a3e4-df8e-4a2c-b388-6a97906e9529']

for (const id of faltantes) {
  const { rows } = await client.query('select * from public.vehiculos where id = $1', [id])
  const v = rows[0]
  const { rows: ins } = await client.query(
    `insert into crm.vehiculos (marca, modelo, version, anio, km, transmision, color, moneda,
       precio_contado, precio_usd, categoria, descripcion, es_nuevo, combustible, estado, publicado)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'disponible', true)
     returning id`,
    [v.marca, v.modelo, v.version, v.anio, v.km, v.transmision, v.color, v.moneda,
     v.precio, v.precio_usd, v.categoria, v.descripcion, v.es_nuevo, v.combustible]
  )
  const vehiculoId = ins[0].id
  const imagenes = [v.imagen_principal, ...(Array.isArray(v.imagenes) ? v.imagenes : [])].filter(Boolean)
  for (const [i, url] of imagenes.entries()) {
    await client.query(
      `insert into crm.vehiculo_fotos (vehiculo_id, url, orden, es_portada) values ($1,$2,$3,$4)`,
      [vehiculoId, url, i, i === 0]
    )
  }
  console.log(`insertado ${v.marca} ${v.modelo} (${v.version}) km=${v.km} → crm.vehiculos ${vehiculoId}`)
}

await client.end()
