import './entorno.js'
import { describe, expect, it } from 'vitest'

const a = await import('../src/almacen.js')
const { anotarEfimero, contextoEfimero } = await import('../src/whatsapp.js')

describe('mensajes temporales: lo del panel sale con el ajuste del chat, como del celular', () => {
  const CHAT = '5493564690844@s.whatsapp.net'

  it('sin ajuste conocido no se agrega nada', () => {
    a.upsertChat(CHAT, { ultimoTs: 1 })
    expect(contextoEfimero(CHAT)).toBeNull()
  })

  it('toma el ajuste de un mensaje que llega (también "apagados" con su fecha de cambio)', () => {
    anotarEfimero(CHAT, { expiracion: 0, marca: 1791319960, iniciador: 'CHANGED_IN_CHAT' })
    expect(contextoEfimero(CHAT)).toEqual({ expiration: 0, ephemeralSettingTimestamp: 1791319960, disappearingMode: { initiator: 0 } })
  })

  it('un mensaje viejo no pisa un ajuste más nuevo, y uno nuevo sí', () => {
    anotarEfimero(CHAT, { expiracion: 86400, marca: 1700000000 })
    expect(contextoEfimero(CHAT).ephemeralSettingTimestamp).toBe(1791319960)
    anotarEfimero(CHAT, { expiracion: 604800, marca: 1792000000, iniciador: 2 })
    expect(contextoEfimero(CHAT)).toEqual({ expiration: 604800, ephemeralSettingTimestamp: 1792000000, disappearingMode: { initiator: 2 } })
  })
})
