import { describe, expect, it } from 'vitest'
import { revisarAlertas, telefonoEmpleado, textoAlerta, tocaAvisar } from '../src/alertas.js'

// 10:05 en Argentina = 13:05 UTC.
const AHORA = new Date('2026-11-10T13:10:00Z')
const alerta = (id, extra = {}) => ({ id, titulo: 'Llamar a Juan', descripcion: 'Por el Gol', fecha: '2026-11-10', hora: '10:05', asignado: { telefono: '03564 15 562413' }, ...extra })

function crmFalso(alertas, { tomadas = [] } = {}) {
  const patches = []
  const rest = async (ruta, { metodo = 'GET', cuerpo } = {}) => {
    if (metodo === 'GET') return alertas
    patches.push({ ruta, cuerpo })
    const id = Number(ruta.match(/id=eq\.(\d+)/)[1])
    return cuerpo.notificado_whatsapp && tomadas.includes(id) ? [] : [{ id }]
  }
  return { rest, patches }
}

function deps(rest, { falla = false } = {}) {
  const enviados = []
  return {
    enviados,
    rest,
    conectado: () => true,
    log: () => {},
    ahora: AHORA,
    abrirChat: async (tel) => `${tel}@s.whatsapp.net`,
    enviarTexto: async (jid, texto) => {
      if (falla) throw new Error('sin señal')
      enviados.push({ jid, texto })
    },
  }
}

describe('alertas del CRM por WhatsApp', () => {
  it('tocaAvisar usa hora de Argentina y se pone al día hasta 24 h', () => {
    expect(tocaAvisar('2026-11-10', '10:05', AHORA)).toBe(true)
    expect(tocaAvisar('2026-11-10', '10:30', AHORA)).toBe(false) // todavía no
    expect(tocaAvisar('2026-11-09', '11:00', AHORA)).toBe(true) // PC apagada desde ayer
    expect(tocaAvisar('2026-11-09', '09:00', AHORA)).toBe(false) // más de 24 h: ya no sirve
  })

  it('la atrasada avisa que llega tarde', () => {
    expect(textoAlerta(alerta(1), AHORA)).not.toContain('Llega tarde')
    expect(textoAlerta(alerta(1, { hora: '08:00' }), AHORA)).toContain('Llega tarde')
  })

  it('manda al teléfono normalizado del asignado y la marca', async () => {
    const { rest, patches } = crmFalso([alerta(1), alerta(2, { hora: '11:00' })])
    const d = deps(rest)
    expect(await revisarAlertas(d)).toBe(1)
    expect(d.enviados).toEqual([{ jid: '5493564562413@s.whatsapp.net', texto: textoAlerta(alerta(1), AHORA) }])
    expect(patches).toEqual([{ ruta: 'alertas?id=eq.1&notificado_whatsapp=eq.false', cuerpo: { notificado_whatsapp: true } }])
    expect(d.enviados[0].texto).toContain('10/11/2026')
  })

  it('acepta el teléfono escrito de varias formas', () => {
    for (const t of ['3564 15 562413', '03564 15 562413', '3564 562413', '+54 9 3564 56-2413']) expect(telefonoEmpleado(t)).toBe('5493564562413')
    expect(telefonoEmpleado(null)).toBe('')
  })

  it('no manda la que ya tomó otro servidor', async () => {
    const { rest } = crmFalso([alerta(1)], { tomadas: [1] })
    const d = deps(rest)
    expect(await revisarAlertas(d)).toBe(0)
    expect(d.enviados).toEqual([])
  })

  it('sin teléfono la marca y no manda nada', async () => {
    const { rest, patches } = crmFalso([alerta(1, { asignado: { telefono: null } })])
    const d = deps(rest)
    expect(await revisarAlertas(d)).toBe(0)
    expect(patches).toHaveLength(1)
  })

  it('si falla el envío la suelta para reintentar', async () => {
    const { rest, patches } = crmFalso([alerta(1)])
    expect(await revisarAlertas(deps(rest, { falla: true }))).toBe(0)
    expect(patches.at(-1)).toEqual({ ruta: 'alertas?id=eq.1', cuerpo: { notificado_whatsapp: false } })
  })

  it('desconectado no consulta el CRM', async () => {
    let consultas = 0
    const d = deps(async () => (consultas++, []))
    d.conectado = () => false
    expect(await revisarAlertas(d)).toBe(0)
    expect(consultas).toBe(0)
  })
})
