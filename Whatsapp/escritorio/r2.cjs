/*
 * Lectura de R2 (Cloudflare, compatible con S3) sin dependencias: firma AWS SigV4 a mano.
 * La usa la app para bajar las versiones nuevas del servidor (ver scripts/publicar.mjs).
 */
function credencialesR2(config) {
  const r2 = {
    bucket: config.WA_R2_BUCKET,
    endpoint: (config.WA_R2_ENDPOINT || config.R2_ENDPOINT || '').replace(/\/+$/, ''),
    accessKeyId: config.WA_R2_ACCESS_KEY_ID || config.R2_ACCESS_KEY_ID,
    secretAccessKey: config.WA_R2_SECRET_ACCESS_KEY || config.R2_SECRET_ACCESS_KEY,
  }
  return Object.values(r2).every(Boolean) ? r2 : null
}

/** GET firmado a R2 (AWS SigV4, sin dependencias). */
async function r2Get(r2, clave) {
  const crypto = require('node:crypto')
  const url = new URL(`${r2.endpoint}/${r2.bucket}/${clave.split('/').map(encodeURIComponent).join('/')}`)
  const fecha = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dia = fecha.slice(0, 8)
  const alcance = `${dia}/auto/s3/aws4_request`
  const cabeceras = { host: url.host, 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', 'x-amz-date': fecha }
  const nombres = Object.keys(cabeceras).sort()
  const canonica = ['GET', url.pathname, '', ...nombres.map((n) => `${n}:${cabeceras[n]}`), '', nombres.join(';'), 'UNSIGNED-PAYLOAD'].join('\n')
  const hmac = (k, t) => crypto.createHmac('sha256', k).update(t).digest()
  let llave = hmac(`AWS4${r2.secretAccessKey}`, dia)
  for (const parte of ['auto', 's3', 'aws4_request']) llave = hmac(llave, parte)
  const aFirmar = ['AWS4-HMAC-SHA256', fecha, alcance, crypto.createHash('sha256').update(canonica).digest('hex')].join('\n')
  const firma = crypto.createHmac('sha256', llave).update(aFirmar).digest('hex')
  const r = await fetch(url, {
    headers: {
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      'x-amz-date': fecha,
      Authorization: `AWS4-HMAC-SHA256 Credential=${r2.accessKeyId}/${alcance}, SignedHeaders=${nombres.join(';')}, Signature=${firma}`,
    },
    signal: AbortSignal.timeout(10 * 60_000),
  })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`R2 respondió ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

module.exports = { credencialesR2, r2Get }
