import { crmLogin } from './crmCore.js'

export const BASE = 'https://neifertcrm.com/backend/api'

export const ENTIDADES = [
  { nombre: 'clientes', path: 'clientes.php' },
  { nombre: 'vehiculos', path: 'vehiculos.php' },
  { nombre: 'peritaje', path: 'peritaje.php' },
  { nombre: 'gestoria', path: 'gestoria.php' },
  { nombre: 'alertas', path: 'alertas.php' },
  { nombre: 'tareas', path: 'tareas.php' },
  { nombre: 'usuarios', path: 'usuarios.php' },
  { nombre: 'jerarquia', path: 'jerarquia.php' },
]

export async function login({ user, pass, fetchImpl }) {
  // crmCore.crmLogin uses global fetch; for tests we allow an override.
  if (fetchImpl) {
    const r = await fetchImpl(`${BASE}/auth/login.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, pass }),
    })
    const json = await r.json()
    if (!json?.ok) throw new Error(json?.error || 'Login del CRM viejo fallo.')
    return json.data.token
  }
  const { json } = await crmLogin(user, pass)
  if (!json?.ok) throw new Error(json?.error || 'Login del CRM viejo fallo.')
  return json.data.token
}

function unwrap(json) {
  if (Array.isArray(json)) return json
  if (Array.isArray(json?.data)) return json.data
  return []
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function fetchEntidad(token, path, { fetchImpl, retries = 3, backoffMs = 500 } = {}) {
  const doFetch = fetchImpl || fetch
  let lastErr
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const r = await doFetch(`${BASE}/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      })
      if (r.status >= 500) throw new Error(`${path} respondio ${r.status}`)
      if (!r.ok) throw new Error(`${path} respondio ${r.status}`)
      return unwrap(await r.json())
    } catch (e) {
      lastErr = e
      if (attempt < retries) await sleep(backoffMs * 2 ** (attempt - 1))
    }
  }
  throw lastErr
}

export async function fetchAll({ user, pass, fetchImpl, backoffMs = 500 }) {
  const token = await login({ user, pass, fetchImpl })
  const settled = await Promise.allSettled(
    ENTIDADES.map((e) => fetchEntidad(token, e.path, { fetchImpl, backoffMs })),
  )
  const resultados = {}
  settled.forEach((s, i) => {
    const nombre = ENTIDADES[i].nombre
    resultados[nombre] = s.status === 'fulfilled'
      ? { ok: true, registros: s.value }
      : { ok: false, error: String(s.reason?.message || s.reason) }
  })
  return { token, resultados }
}
