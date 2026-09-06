import { describe, it, expect, vi } from 'vitest'
import { login, fetchEntidad, fetchAll, ENTIDADES } from '../../legacyFetch.js'

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

describe('login', () => {
  it('returns the token on ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: { token: 'T', nombre: 'B', role: 'vendedor' } }))
    await expect(login({ user: 'u', pass: 'p', fetchImpl })).resolves.toBe('T')
  })
  it('throws on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: 'bad creds' }, 401))
    await expect(login({ user: 'u', pass: 'p', fetchImpl })).rejects.toThrow(/bad creds/)
  })
})

describe('fetchEntidad', () => {
  it('unwraps { data: [...] }', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: [{ id: '1' }] }))
    await expect(fetchEntidad('T', 'clientes.php', { fetchImpl })).resolves.toEqual([{ id: '1' }])
  })
  it('retries on HTTP 500 then succeeds', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: '2' }] }))
    await expect(fetchEntidad('T', 'x.php', { fetchImpl, retries: 2, backoffMs: 0 })).resolves.toEqual([{ id: '2' }])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('fetchAll', () => {
  it('logs in once and reports per-entity ok/error', async () => {
    const fetchImpl = vi.fn().mockImplementation((url) => {
      if (String(url).endsWith('/auth/login.php')) return Promise.resolve(jsonResponse({ ok: true, data: { token: 'T' } }))
      if (String(url).endsWith('/gestoria.php')) return Promise.resolve(jsonResponse({}, 503))
      return Promise.resolve(jsonResponse({ data: [{ id: 'z' }] }))
    })
    const { token, resultados } = await fetchAll({ user: 'u', pass: 'p', fetchImpl, backoffMs: 0 })
    expect(token).toBe('T')
    expect(resultados.clientes).toEqual({ ok: true, registros: [{ id: 'z' }] })
    expect(resultados.gestoria.ok).toBe(false)
    expect(Object.keys(resultados).length).toBe(ENTIDADES.length)
  })
})
