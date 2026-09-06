import { createHash } from 'node:crypto'

/** JSON con claves de objeto ordenadas recursivamente — determinístico. */
export function canonicalJson(value) {
  return JSON.stringify(sortDeep(value))
}

function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep)
  if (v && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k])
    return out
  }
  return v
}

export function sha256Hex(str) {
  return createHash('sha256').update(str, 'utf8').digest('hex')
}

export function payloadHash(value) {
  return sha256Hex(canonicalJson(value))
}
