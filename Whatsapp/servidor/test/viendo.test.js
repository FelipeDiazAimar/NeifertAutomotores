import './entorno.js'
import { afterAll, describe, expect, it, vi } from 'vitest'

// Quién hace cada pedido: se cambia en cada paso del test.
let actual = null
vi.mock('../src/auth.js', () => ({ usuarioActual: () => actual, manejaLinea: (u) => !!u?.linea }))

vi.useFakeTimers()
const { marcarViendo, ocupanteDe } = await import('../src/eventos.js')
afterAll(() => vi.useRealTimers())

const ANA = { id: 'u-ana', nombre: 'Ana Pérez', linea: true }
const VICO = { id: 'u-vico', nombre: 'Vico' }
const LU = { id: 'u-lu', nombre: 'Lu' }
const como = (u, fn) => {
  actual = u
  return fn()
}
const CHAT = '5493406111111@s.whatsapp.net'
const OTRO = '5493406222222@s.whatsapp.net'

describe('un chat, una persona', () => {
  it('quien llega segundo no entra y sabe quién lo tiene', () => {
    como(VICO, () => marcarViendo('pv1', CHAT))
    let error
    try {
      como(LU, () => marcarViendo('pl1', CHAT))
    } catch (err) {
      error = err
    }
    expect(error?.status).toBe(409)
    expect(error?.datos?.ocupado).toEqual({ id: VICO.id, nombre: 'Vico' })
    expect(ocupanteDe(CHAT, LU.id)).toEqual({ id: VICO.id, nombre: 'Vico' })
  })

  it('la misma persona puede tenerlo abierto en otra pestaña', () => {
    expect(() => como(VICO, () => marcarViendo('pv2', CHAT))).not.toThrow()
    expect(ocupanteDe(CHAT, VICO.id)).toBeNull()
  })

  it('al rechazar, quien pidió entrar sigue en el chat que tenía', () => {
    como(LU, () => marcarViendo('pl1', OTRO))
    expect(() => como(LU, () => marcarViendo('pl1', CHAT))).toThrow()
    expect(ocupanteDe(OTRO, VICO.id)).toEqual({ id: LU.id, nombre: 'Lu' })
  })

  it('sin ser administrador, "forzar" no alcanza', () => {
    expect(() => como(LU, () => marcarViendo('pl1', CHAT, { forzar: true }))).toThrow(/Vico está atendiendo/)
  })

  it('un administrador lo puede tomar y la otra persona queda afuera', () => {
    como(ANA, () => marcarViendo('pa1', CHAT, { forzar: true }))
    expect(ocupanteDe(CHAT, VICO.id)).toEqual({ id: ANA.id, nombre: 'Ana Pérez' })
    expect(() => como(VICO, () => marcarViendo('pv1', CHAT))).toThrow(/Ana Pérez está atendiendo/)
  })

  it('al cerrar el chat queda libre', () => {
    como(ANA, () => marcarViendo('pa1', null))
    expect(ocupanteDe(CHAT, LU.id)).toBeNull()
    expect(() => como(LU, () => marcarViendo('pl1', CHAT))).not.toThrow()
  })

  it('si nadie avisa que sigue ahí, se libera solo a los pocos minutos', () => {
    expect(ocupanteDe(CHAT, VICO.id)).toEqual({ id: LU.id, nombre: 'Lu' })
    vi.advanceTimersByTime(4 * 60_000)
    expect(ocupanteDe(CHAT, VICO.id)).toBeNull()
  })

  it('avisar que sigue en el chat lo mantiene ocupado', () => {
    como(LU, () => marcarViendo('pl1', CHAT))
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(60_000)
      como(LU, () => marcarViendo('pl1', CHAT))
    }
    expect(ocupanteDe(CHAT, VICO.id)).toEqual({ id: LU.id, nombre: 'Lu' })
  })
})
