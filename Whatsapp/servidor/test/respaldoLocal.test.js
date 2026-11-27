import './entorno.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { registrarRespaldoLocal, revisarRespaldoLocal, vistaRespaldoLocal } from '../src/respaldoLocal.js'

// La base se simula con un objeto en memoria.
let guardado
const almacen = { leer: async () => guardado, guardar: async (v) => { guardado = structuredClone(v) } }
const USUARIOS = [
  { id: 'u-admin', rol: 'admin' },
  { id: 'u-dueno', rol: 'dueno' },
  { id: 'u-bruno', rol: 'vendedor' },
  { id: 'u-nico', rol: 'vendedor' },
]
let alertas
const rest = async (ruta, opciones = {}) => {
  if (opciones.metodo === 'POST') {
    alertas.push(opciones.cuerpo)
    return [{ id: alertas.length }]
  }
  return USUARIOS
}
const dia = (n, h = 12) => new Date(Date.UTC(2027, 0, 1 + n, h))
const revisar = (ahora, extra = {}) => revisarRespaldoLocal({ almacen, ahora, rest, configurado: true, ...extra })

beforeEach(() => {
  guardado = null
  alertas = []
})

describe('respaldo local (el que se baja a mano)', () => {
  it('cada respaldo queda anotado en la base con quién, cuántos chats y mensajes', async () => {
    await registrarRespaldoLocal({ usuario: 'Feli', chats: 40, mensajes: 9000, conArchivos: true, hasta: 1800000000 }, { almacen, ahora: dia(0) })
    await registrarRespaldoLocal({ usuario: 'Bruno', chats: 41, mensajes: 9100, conArchivos: false }, { almacen, ahora: dia(2) })
    expect(guardado.ultimo).toBe(dia(2).toISOString())
    expect(guardado.historial).toHaveLength(2)
    expect(guardado.historial[0]).toMatchObject({ usuario: 'Bruno', chats: 41, mensajes: 9100, conArchivos: false })
    expect(guardado.historial[1]).toMatchObject({ usuario: 'Feli', conArchivos: true, hasta: 1800000000 })
  })

  it('guarda solo los últimos 120', async () => {
    for (let i = 0; i < 125; i++) await registrarRespaldoLocal({ chats: 1, mensajes: i }, { almacen, ahora: dia(i) })
    expect(guardado.historial).toHaveLength(120)
    expect(guardado.historial[0].mensajes).toBe(124)
  })

  it('si la base falla al anotar, no tira (el respaldo ya se hizo)', async () => {
    const rota = { leer: async () => null, guardar: async () => { throw new Error('base caída') } }
    await expect(registrarRespaldoLocal({ chats: 1, mensajes: 1 }, { almacen: rota })).resolves.toBeNull()
  })
})

describe('aviso si falta el respaldo local', () => {
  it('el primer día no avisa: empieza a contar desde que se vigila', async () => {
    await revisar(dia(0))
    expect(alertas).toHaveLength(0)
    expect(guardado.vigilarDesde).toBe(dia(0).toISOString())
    await revisar(dia(3))
    expect(alertas).toHaveLength(0)
  })

  it('a los 3 días sin ninguno avisa a admin, dueño y a los marcados; no a los demás', async () => {
    await revisar(dia(0))
    await revisar(dia(3, 13))
    expect(alertas.map((a) => a.asignado_a)).toEqual(['u-admin', 'u-dueno'])
    expect(alertas[0].titulo).toMatch(/respaldo local/i)
    expect(alertas[0].descripcion).toMatch(/ningún respaldo local/)
  })

  it('suma a los usuarios elegidos en el panel', async () => {
    const { config, setConfig } = await import('../src/almacen.js')
    setConfig({ avisarRespaldo: ['u-bruno'] })
    try {
      await revisar(dia(0))
      await revisar(dia(4))
      expect(alertas.map((a) => a.asignado_a)).toEqual(['u-admin', 'u-dueno', 'u-bruno'])
    } finally {
      setConfig({ avisarRespaldo: [] })
      expect(config().avisarRespaldo).toEqual([])
    }
  })

  it('avisa una vez por día, no cada hora', async () => {
    await revisar(dia(0))
    await revisar(dia(4, 0))
    await revisar(dia(4, 5))
    expect(alertas).toHaveLength(2)
    await revisar(dia(5, 13))
    expect(alertas).toHaveLength(4)
  })

  it('un respaldo reciente corta el aviso; hacer uno nuevo reinicia la cuenta', async () => {
    await revisar(dia(0))
    await registrarRespaldoLocal({ chats: 1, mensajes: 1 }, { almacen, ahora: dia(2) })
    await revisar(dia(4))
    expect(alertas).toHaveLength(0)
    await revisar(dia(6))
    expect(alertas).toHaveLength(2)
    expect(alertas[0].descripcion).toMatch(/último respaldo local/)
  })

  it('sin el CRM configurado no crea alertas y no revienta', async () => {
    await revisar(dia(0), { configurado: false })
    await revisar(dia(5), { configurado: false })
    expect(alertas).toHaveLength(0)
  })

  it('la vista dice cuántos días pasaron y si está atrasado', async () => {
    await registrarRespaldoLocal({ chats: 1, mensajes: 1 }, { almacen, ahora: dia(0) })
    expect(await vistaRespaldoLocal({ almacen, ahora: dia(2) })).toMatchObject({ atrasado: false, diasSinRespaldo: 2 })
    expect(await vistaRespaldoLocal({ almacen, ahora: dia(4) })).toMatchObject({ atrasado: true, diasSinRespaldo: 4, avisoDias: 3 })
  })
})
