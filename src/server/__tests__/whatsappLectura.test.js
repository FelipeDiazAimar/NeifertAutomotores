import { beforeEach, describe, expect, it, vi } from 'vitest'

// La base del WhatsApp, simulada: las filas 'crm' de wa.estado (qué CRM muestra qué línea).
const filasCrm = []
const consultas = []
vi.mock('pg', () => ({
  default: {
    Pool: class {
      query(sql, params = []) {
        consultas.push({ sql, params })
        if (/clave = 'crm'/.test(sql)) {
          const host = params[0]
          const linea = filasCrm.filter((f) => f.hosts.includes(host)).sort((a, b) => b.ts - a.ts)[0]?.linea
          return { rows: linea ? [{ linea }] : [] }
        }
        return { rows: [] }
      }
    },
  },
}))

const { handleWhatsappLectura, hostNormalizado } = await import('../whatsappLectura.js')

function pedir(ruta, host, env = {}) {
  const req = { method: 'GET', headers: { host }, query: {} }
  const res = { statusCode: 200, headers: {}, cuerpo: null, setHeader(k, v) { this.headers[k] = v }, end(c) { this.cuerpo = c ? JSON.parse(c) : null } }
  return handleWhatsappLectura(req, res, { env: { WA_DATABASE_URL: 'postgres://x', ...env }, ruta }).then(() => res)
}

describe('vista sin conexión: cada CRM ve la línea de su servidor', () => {
  beforeEach(() => {
    filasCrm.length = 0
    consultas.length = 0
  })

  it('el dominio se compara sin www ni puerto por defecto', () => {
    expect(hostNormalizado('WWW.Neifert.com:443')).toBe('neifert.com')
    expect(hostNormalizado('localhost:5173')).toBe('localhost:5173')
    expect(hostNormalizado('crm.ejemplo.com, proxy.interno')).toBe('crm.ejemplo.com')
  })

  it('el panel recibe la línea que anotó el servidor de ese CRM', async () => {
    filasCrm.push({ linea: '5493406111111', hosts: ['crm-prueba.vercel.app'], ts: 1 })
    filasCrm.push({ linea: '5493406222222', hosts: ['neifert.com'], ts: 2 })
    const res = await pedir('servidor', 'crm-prueba.vercel.app')
    expect(res.statusCode).toBe(200)
    const pedido = consultas.find((c) => /clave = 'crm'/.test(c.sql))
    expect(pedido.params).toEqual(['crm-prueba.vercel.app'])
    const lectura = consultas.find((c) => /clave = 'lectura'/.test(c.sql))
    expect(lectura.params).toEqual(['5493406111111'])
  })

  it('si el número cambió, gana la anotación más nueva', async () => {
    filasCrm.push({ linea: '5493406111111', hosts: ['otro-crm.com'], ts: 1 })
    filasCrm.push({ linea: '5493406333333', hosts: ['otro-crm.com'], ts: 5 })
    await pedir('servidor', 'www.otro-crm.com')
    expect(consultas.find((c) => /clave = 'lectura'/.test(c.sql)).params).toEqual(['5493406333333'])
  })

  it('sin anotación usa WA_LINEA', async () => {
    await pedir('servidor', 'sin-anotar.com', { WA_LINEA: '+54 9 3406 444444' })
    expect(consultas.find((c) => /clave = 'lectura'/.test(c.sql)).params).toEqual(['5493406444444'])
  })

  it('sin anotación ni WA_LINEA no muestra ninguna línea: avisa', async () => {
    filasCrm.push({ linea: '5493406111111', hosts: ['otro.com'], ts: 1 })
    const res = await pedir('servidor', 'nadie.com')
    expect(res.cuerpo.lectura).toBeNull()
    expect(consultas.some((c) => /clave = 'lectura'/.test(c.sql))).toBe(false)
  })
})
