import { describe, expect, it } from 'vitest'
import { historialParaBot } from '../src/historialBot.js'

const AHORA = Date.UTC(2026, 10, 27, 15, 0)
const s = (ms) => Math.floor(ms / 1000)
const DIA = 86400000

describe('historialParaBot', () => {
  const chat = [
    { ts: s(AHORA - 3 * DIA), deMi: false, tipo: 'texto', texto: 'Hola, vi la Hilux' },
    { ts: s(AHORA - 3 * DIA + 60000), deMi: true, tipo: 'texto', texto: 'Hola! Sí, está disponible' },
    { ts: s(AHORA - 3 * DIA + 120000), deMi: false, tipo: 'imagen', texto: '' },
    { ts: s(AHORA - 2 * DIA), deMi: false, tipo: 'texto', texto: 'Cuánto es la entrega?', sofia: { rol: 'cliente' } },
    { ts: s(AHORA - 2 * DIA + 5000), deMi: true, tipo: 'texto', texto: 'Hola, soy Sofía', sofia: { rol: 'bot' } },
    { ts: s(AHORA - DIA), deMi: true, tipo: 'texto', texto: 'borrado', eliminado: true },
    { ts: s(AHORA - DIA), deMi: false, tipo: 'sistema', texto: '' },
  ]
  it('junta al cliente, al asesor y a Sofía, en orden', () => {
    const h = historialParaBot(chat, { ahora: AHORA })
    expect(h.map((m) => `${m.rol}:${m.texto}`)).toEqual(['cliente:Hola, vi la Hilux', 'asesor:Hola! Sí, está disponible', 'cliente:[imagen]', 'cliente:Cuánto es la entrega?', 'sofia:Hola, soy Sofía'])
  })
  it('deja afuera lo eliminado, lo de sistema y lo anterior a los días pedidos', () => {
    expect(historialParaBot(chat, { ahora: AHORA, dias: 2.5 }).map((m) => m.rol)).toEqual(['cliente', 'sofia'])
  })
  it('se queda con los últimos N', () => {
    expect(historialParaBot(chat, { ahora: AHORA, limite: 2 }).map((m) => m.texto)).toEqual(['Cuánto es la entrega?', 'Hola, soy Sofía'])
  })
  it('un chat vacío o inexistente', () => {
    expect(historialParaBot([], { ahora: AHORA })).toEqual([])
    expect(historialParaBot(undefined)).toEqual([])
  })
})
