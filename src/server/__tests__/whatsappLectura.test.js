import { beforeEach, describe, expect, it, vi } from 'vitest'

// La base del WhatsApp, simulada: las filas 'crm' de wa.estado (qué CRM muestra qué línea).
const filasCrm = []
const consultas = []
vi.mock('pg', () => ({
  default: {
    Pool: class {
      query(sql, params = []) {
        consultas.push({ sql, params })
        // El CRM anota su línea (insert) y se la saca a las demás (update).
        if (/^\s*insert into wa\.estado/.test(sql) && /'crm'/.test(sql)) {
          const [linea, host] = params
          const fila = filasCrm.find((f) => f.linea === linea)
          if (fila) fila.hosts = [...fila.hosts.filter((h) => h !== host), host]
          else filasCrm.push({ linea, hosts: [host], ts: Date.now() })
          return { rows: [] }
        }
        if (/^\s*update wa\.estado/.test(sql)) {
          const [linea, host] = params
          for (const f of filasCrm) if (f.linea !== linea) f.hosts = f.hosts.filter((h) => h !== host)
          return { rows: [] }
        }
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

  it('con su servidor encendido, el CRM anota la línea que dice /api/salud y se la saca a la otra', async () => {
    filasCrm.push({ linea: '5493406111111', hosts: ['crm-nuevo.com'], ts: 1 })
    const fetchOriginal = globalThis.fetch
    globalThis.fetch = async () => ({ json: async () => ({ conexion: 'conectado', linea: '5493564999999' }) })
    try {
      const res = await pedir('servidor', 'crm-nuevo.com', { VITE_WHATSAPP_PANEL_URL: 'https://wa.crm-nuevo.com' })
      expect(res.cuerpo.responde).toBe(true)
    } finally {
      globalThis.fetch = fetchOriginal
    }
    expect(filasCrm.find((f) => f.linea === '5493564999999').hosts).toEqual(['crm-nuevo.com'])
    expect(filasCrm.find((f) => f.linea === '5493406111111').hosts).toEqual([])
    expect(consultas.find((c) => /clave = 'lectura'/.test(c.sql)).params).toEqual(['5493564999999'])
  })

  it('sin anotación no muestra ninguna línea (aunque haya otras con mensajes): avisa', async () => {
    filasCrm.push({ linea: '5493406111111', hosts: ['otro.com'], ts: 1 })
    const res = await pedir('servidor', 'nadie.com')
    expect(res.cuerpo.lectura).toBeNull()
    expect(consultas.some((c) => /clave = 'lectura'/.test(c.sql))).toBe(false)
  })
})
