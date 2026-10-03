/*
 * Sube a Cloudflare R2 los archivos que el servidor guardó en el disco antes de tener R2
 * (data/media y data/fotos), con las mismas claves.
 *
 * Uso:
 *   npm run subir-r2              sube lo que falta; el disco queda igual
 *   npm run subir-r2 -- --borrar  además borra del disco lo que ya está en R2
 *
 * Se puede correr con el servidor prendido y más de una vez: lo que ya está en R2 con el
 * mismo tamaño no se vuelve a subir. Mientras un archivo siga en el disco, el servidor lo
 * entrega desde ahí; cuando se borra, lo trae de R2.
 */
import fs from 'node:fs'
import path from 'node:path'
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { ARCHIVOS_EN_R2, DATA_DIR, R2 } from '../src/config.js'

if (!ARCHIVOS_EN_R2) {
  console.error('R2 no está configurado. Falta WA_R2_BUCKET (y R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY). Ver docs/SERVIDOR.md.')
  process.exit(1)
}
const borrar = process.argv.includes('--borrar')

const cliente = new S3Client({
  endpoint: R2.endpoint,
  region: 'auto',
  credentials: { accessKeyId: R2.accessKeyId, secretAccessKey: R2.secretAccessKey },
})

const TIPOS = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', '3gp': 'video/3gpp', mov: 'video/quicktime', webm: 'video/webm',
  ogg: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav',
  pdf: 'application/pdf',
}

function archivosDe(carpeta) {
  const todos = []
  const recorrer = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) recorrer(p)
      else todos.push(p)
    }
  }
  recorrer(path.join(DATA_DIR, carpeta))
  return todos
}

/** Tamaño del objeto en R2, o null si no está. */
async function tamanoEnR2(clave) {
  try {
    const r = await cliente.send(new HeadObjectCommand({ Bucket: R2.bucket, Key: clave }))
    return r.ContentLength ?? null
  } catch (err) {
    if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) return null
    throw err
  }
}

const archivos = [...archivosDe('media'), ...archivosDe('fotos')]
console.log(`Bucket ${R2.bucket} · ${archivos.length} archivos en el disco${borrar ? ' · se borran del disco los que ya estén en R2' : ''}`)

let subidos = 0
let yaEstaban = 0
let borrados = 0
let errores = 0
for (const ruta of archivos) {
  const clave = path.relative(DATA_DIR, ruta).split(path.sep).join('/')
  try {
    const tamano = fs.statSync(ruta).size
    if ((await tamanoEnR2(clave)) === tamano) yaEstaban++
    else {
      const ext = path.extname(ruta).slice(1).toLowerCase()
      await cliente.send(new PutObjectCommand({
        Bucket: R2.bucket,
        Key: clave,
        Body: fs.readFileSync(ruta),
        ContentType: TIPOS[ext] || 'application/octet-stream',
      }))
      subidos++
    }
    if (borrar) {
      fs.rmSync(ruta)
      borrados++
    }
  } catch (err) {
    errores++
    console.error(`  ${clave}: ${err.message}`)
  }
}

console.log(`Listo: ${subidos} subidos · ${yaEstaban} ya estaban en R2${borrar ? ` · ${borrados} borrados del disco` : ''}${errores ? ` · ${errores} con error` : ''}`)
process.exit(errores ? 1 : 0)
