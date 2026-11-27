import { describe, expect, it, vi } from 'vitest'
import { handleUsuarios } from '../../../api/crm/usuarios.js'

const env = { VITE_SUPABASE_URL: 'u', VITE_SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 'k' }

const mockRes = () => {
  const res = { cabeceras: {} }
  res.setHeader = vi.fn()
  res.status = (c) => ((res.codigo = c), res)
  res.json = (b) => ((res.cuerpo = b), res)
  return res
}

/** Un CRM de mentira: quién es el que llama y qué rol tiene. */
const deps = (rol, extra = {}) => ({
  makeAnon: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } }),
  makeAdmin: () => ({
    schema: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { rol, activo: true }, error: null }) }) }) }) }),
  }),
  ...extra,
})
const pedir = (rol, extra) => {
  const res = mockRes()
  return handleUsuarios({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { accion: 'respaldos_whatsapp' } }, res, { env, deps: deps(rol, extra) }).then(() => res)
}

describe('historial de respaldos de WhatsApp (Admin)', () => {
  it('lo ve el admin y el dueño', async () => {
    const historialRespaldos = vi.fn().mockResolvedValue({ linea: '549', items: [{ tipo: 'local', ts: '2026-12-01T12:00:00Z', ok: true }] })
    for (const rol of ['admin', 'dueno']) {
      const res = await pedir(rol, { historialRespaldos })
      expect(res.codigo).toBe(200)
      expect(res.cuerpo).toMatchObject({ ok: true, items: [{ tipo: 'local' }] })
    }
  })

  it('otro rol no pasa', async () => {
    const historialRespaldos = vi.fn()
    const res = await pedir('vendedor', { historialRespaldos })
    expect(res.codigo).toBe(403)
    expect(historialRespaldos).not.toHaveBeenCalled()
  })

  it('sin línea asignada devuelve el motivo y su código', async () => {
    const historialRespaldos = vi.fn().mockRejectedValue(Object.assign(new Error('Este CRM todavía no tiene una línea'), { status: 409 }))
    const res = await pedir('admin', { historialRespaldos })
    expect(res.codigo).toBe(409)
    expect(res.cuerpo.error).toMatch(/línea/)
  })
})
