import './entorno.js'
import { describe, expect, it } from 'vitest'
import { calcular, dentroDeHorario, informe } from '../src/estadisticasIA.js'

// Argentina = UTC-3: "10:00 en Argentina" es 13:00 UTC.
const ar = (iso) => new Date(`${iso}-03:00`).getTime()
// 2026-12-07 es lunes.

describe('horario de atención', () => {
  it('lunes a viernes de 8 a 12:30 y de 16 a 20, sábados de 9 a 13, domingo cerrado', () => {
    expect(dentroDeHorario(ar('2026-12-07T08:00'))).toBe(true)
    expect(dentroDeHorario(ar('2026-12-07T12:29'))).toBe(true)
    expect(dentroDeHorario(ar('2026-12-07T12:30'))).toBe(false) // el mediodía está cerrado
    expect(dentroDeHorario(ar('2026-12-07T15:59'))).toBe(false)
    expect(dentroDeHorario(ar('2026-12-07T16:00'))).toBe(true)
    expect(dentroDeHorario(ar('2026-12-07T20:00'))).toBe(false)
    expect(dentroDeHorario(ar('2026-12-07T07:59'))).toBe(false)
    expect(dentroDeHorario(ar('2026-12-12T10:00'))).toBe(true) // sábado
    expect(dentroDeHorario(ar('2026-12-12T14:00'))).toBe(false)
    expect(dentroDeHorario(ar('2026-12-13T11:00'))).toBe(false) // domingo
  })

  it('se mide en hora de Argentina, no en UTC', () => {
    // 23:30 del domingo en Argentina ya es lunes en UTC: sigue siendo fuera de horario.
    expect(dentroDeHorario(Date.UTC(2026, 11, 14, 2, 30))).toBe(false)
    // 08:30 en Argentina (11:30 UTC) un lunes: abierto.
    expect(dentroDeHorario(Date.UTC(2026, 11, 7, 11, 30))).toBe(true)
  })
})

describe('respuestas del asistente fuera de horario', () => {
  const m = (chat, iso) => ({ chat, ts: ar(iso) })

  it('cuenta solo lo que entra con el salón cerrado y junta los mensajes seguidos en una respuesta', () => {
    const r = calcular([
      m('A', '2026-12-07T10:00'), // abierto: no cuenta
      m('A', '2026-12-07T21:00:00'), // cerrado: ráfaga 1
      m('A', '2026-12-07T21:00:30'), // misma ráfaga
      m('A', '2026-12-07T21:00:50'), // misma ráfaga
      m('A', '2026-12-07T21:05'), // ráfaga 2 (pasaron más de 90 s)
      m('B', '2026-12-07T22:00'), // otro contacto
    ])
    expect(r.mensajes).toBe(6)
    expect(r.mensajesFuera).toBe(5)
    expect(r.respuestasFuera).toBe(3)
    expect(r.contactosFuera).toBe(2)
  })

  it('una conversación nueva es después de 12 horas sin hablar', () => {
    const r = calcular([m('A', '2026-12-07T21:00'), m('A', '2026-12-08T02:00'), m('A', '2026-12-08T22:30')])
    expect(r.conversacionesFuera).toBe(2)
    expect(r.respuestasFuera).toBe(3)
  })

  it('el pico: por día, por hora y por minuto', () => {
    const lista = [
      ...['A', 'B', 'C', 'D'].map((c) => m(c, '2026-12-07T21:15:10')), // 4 contactos en el mismo minuto
      m('E', '2026-12-07T21:40'),
      m('F', '2026-12-08T21:00'),
    ]
    const r = calcular(lista)
    expect(r.minutoMasCargado).toEqual({ clave: '2026-12-07 21:15', n: 4 })
    expect(r.horaMasCargada).toEqual({ clave: '2026-12-07 21h', n: 5 })
    expect(r.diaMasCargado).toEqual({ clave: '2026-12-07', n: 5 })
    expect(r.porMes).toEqual({ '2026-12': 6 })
  })

  it('el mes se cuenta en hora de Argentina (la medianoche de fin de mes no se corre)', () => {
    // 22:30 del 30/11 en Argentina es 01:30 UTC del 1/12.
    const r = calcular([m('A', '2026-11-30T22:30'), m('B', '2026-12-01T22:30')])
    expect(r.porMes).toEqual({ '2026-11': 1, '2026-12': 1 })
  })

  it('promedia por 30 días sobre el período y acepta fechas en texto o Date', () => {
    const lista = Array.from({ length: 60 }, (_, i) => ({ chat: `c${i}`, ts: new Date(ar('2026-12-07T21:00')).toISOString() }))
    expect(calcular(lista, { dias: 60 }).respuestasPorMes).toBe(30)
    expect(calcular([{ chat: 'x', ts: new Date(ar('2026-12-07T21:00')) }, { chat: 'y', ts: 'no es una fecha' }]).mensajes).toBe(1)
  })

  it('sin mensajes no rompe y el informe lo dice', () => {
    const r = calcular([])
    expect(r.respuestasFuera).toBe(0)
    expect(informe(r)).toContain('Alcanza el cupo: sí')
  })

  it('el informe compara con el cupo mensual y avisa si no alcanza', () => {
    const lista = Array.from({ length: 2000 }, (_, i) => ({ chat: `c${i}`, ts: ar('2026-12-07T21:00') }))
    const texto = informe(calcular(lista, { dias: 30 }), { dias: 30, cupoMensual: 1500 })
    expect(texto).toContain('133%')
    expect(texto).toContain('NO en el mes más cargado')
    expect(informe(calcular(lista.slice(0, 300), { dias: 30 }), { dias: 30, cupoMensual: 1500 })).toContain('20%')
  })
})
