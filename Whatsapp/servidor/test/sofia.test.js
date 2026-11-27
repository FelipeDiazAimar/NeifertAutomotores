import './entorno.js'
import { describe, expect, it } from 'vitest'
import { buscarChat, listarChats, listarMensajes, paginaDeMensajes, upsertChat, agregarMensaje } from '../src/almacen.js'
import { textoDeChat } from '../src/exportar.js'
import { esDeSofia, guardarCharla, sofiaVisto } from '../src/sofia.js'

const J = '5493492777111@s.whatsapp.net'
const charla = (extra = {}) => ({
  telefono: '+54 9 3492 77-7111',
  nombre: 'Lucía',
  asistente: 'Sofía',
  mensajes: [
    { id: 'c1', rol: 'cliente', texto: '¿Tienen el Gol?', ts: 1_800_000_000_000 },
    { id: 'b1', rol: 'bot', texto: 'Sí, un 2015.', ts: 1_800_000_005_000 },
  ],
  ...extra,
})

describe('charlas de Sofía en el chat del cliente', () => {
  it('quedan en el chat del teléfono, sin tocar los no leídos ni el último de la línea', () => {
    const r = guardarCharla(charla())
    expect(r).toEqual({ ok: true, chatId: J, nuevos: 2 })
    const chat = buscarChat(J)
    expect(chat).toMatchObject({ noLeidos: 0, ultimoTs: 0, ultimo: null, pushName: 'Lucía', sofiaNoVistos: 2, sofiaTs: 1_800_000_005, sofiaAsistente: 'Sofía', sofiaUltimo: { texto: 'Sí, un 2015.' } })
    const [cliente, bot] = paginaDeMensajes(J).mensajes
    expect(cliente).toMatchObject({ id: 'sofia:c1', deMi: false, sofia: { rol: 'cliente' } })
    expect(bot).toMatchObject({ id: 'sofia:b1', deMi: true, ts: 1_800_000_005, sofia: { rol: 'bot', asistente: 'Sofía' } })
  })

  it('repetir el envío no duplica', () => {
    expect(guardarCharla(charla()).nuevos).toBe(0)
    expect(buscarChat(J).sofiaNoVistos).toBe(2)
  })

  it('se mezclan por hora con los de la línea pero no cuentan como de la línea', () => {
    agregarMensaje(J, { id: 'L1', ts: 1_800_000_002, deMi: false, tipo: 'texto', texto: 'mensaje a Neifert' })
    const pagina = paginaDeMensajes(J)
    const ids = pagina.mensajes.map((m) => m.id)
    expect(ids).toEqual(['sofia:c1', 'L1', 'sofia:b1'])
    expect(listarMensajes(J).map((m) => m.id)).toEqual(['L1'])
    expect(buscarChat(J).ultimo).toMatchObject({ id: 'L1' })
  })

  it('al abrir el chat quedan vistos', () => {
    sofiaVisto(J)
    expect(buscarChat(J).sofiaNoVistos).toBe(0)
  })

  it('la lista ordena por lo último, sea de la línea o de Sofía', () => {
    upsertChat('5493492777222@s.whatsapp.net', { ultimoTs: 1_800_000_003 })
    const orden = listarChats().map((c) => c.id)
    expect(orden.indexOf(J)).toBeLessThan(orden.indexOf('5493492777222@s.whatsapp.net'))
  })

  it('al exportar, Sofía figura como el asistente', () => {
    const mensajes = listarMensajes(J, { conSofia: true }).filter((m) => m.sofia)
    expect(textoDeChat({ nombre: 'Lucía', telefono: '+5493492777111' }, mensajes)).toContain('Sofía (IA): Sí, un 2015.')
  })

  it('rechaza lo que no sirve', () => {
    expect(() => guardarCharla(charla({ telefono: 'x' }))).toThrow(/Teléfono/)
    expect(() => guardarCharla(charla({ mensajes: [] }))).toThrow(/ningún/)
    expect(() => guardarCharla(charla({ mensajes: [{ id: 'z', rol: 'otro', texto: 'a', ts: 1 }] }))).toThrow(/rol/)
    expect(esDeSofia('sofia:x')).toBe(true)
    expect(esDeSofia('3EB0')).toBe(false)
  })
})
