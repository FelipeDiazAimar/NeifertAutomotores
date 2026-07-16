import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Lógica de Cloudflare R2 (S3-compatible), sin dependencias de Vite ni
 * Vercel, para poder llamarse desde el plugin de dev
 * (src/plugins/r2Proxy.js) y desde las funciones serverless de producción
 * (api/r2/*.js).
 */

export function createR2Client({ accessKeyId, secretAccessKey, endpoint }) {
  return new S3Client({
    endpoint,
    region: 'auto',
    credentials: { accessKeyId, secretAccessKey },
  })
}

/** Genera una URL firmada de PUT + la URL pública final del archivo. */
export async function presignR2Upload(client, { bucket, filename, contentType, publicUrlBase }) {
  if (!filename) throw new Error('Falta filename')
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: filename,
    ContentType: contentType || 'application/octet-stream',
  })
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 })
  const publicUrl = `${publicUrlBase.replace(/\/$/, '')}/${filename}`
  return { uploadUrl, publicUrl }
}

/** Sube un archivo directo a R2 (sin presign) — para scripts/servidores de
 *  confianza que ya tienen las credenciales reales a mano (ej. el sync de
 *  Instagram), a diferencia del navegador que sube vía URL firmada. */
export async function putR2Object(client, { bucket, filename, body, contentType }) {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: filename,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    })
  )
}

/** Borra un objeto de R2 a partir de su URL pública. Devuelve { ok, error }. */
export async function deleteR2Object(client, { bucket, url, publicUrlBase }) {
  const base = publicUrlBase.replace(/\/$/, '')
  if (!url || !url.startsWith(base)) {
    return { ok: false, error: 'La URL no pertenece a este bucket de R2.' }
  }
  const key = decodeURIComponent(url.slice(base.length + 1))
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  return { ok: true }
}

/** Lista todos los objetos de un bucket (pagina automáticamente). */
export async function listR2Objects(client, { bucket, prefix } = {}) {
  let allObjects = []
  let continuationToken = undefined

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 1000,
      ContinuationToken: continuationToken,
    })
    const response = await client.send(command)

    if (response.Contents) {
      for (const obj of response.Contents) {
        allObjects.push({
          key: obj.Key,
          size: obj.Size || 0,
          lastModified: obj.LastModified,
        })
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)

  return allObjects
}
