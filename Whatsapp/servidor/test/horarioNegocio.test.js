import { describe, expect, it } from 'vitest'
import { estaAbierto, interpretarHorarios } from '../src/negocioBot.js'

const TEXTO = 'Lun a Vie · 8 a 12 h y 15:30 a 19:30 h · Sáb 9 a 13 h'
// viernes 27/11/2026, 12:00 en Argentina (UTC-3)
const VIERNES = Date.UTC(2026, 10, 27, 15, 0)

describe('interpretarHorarios', () => {
  it('rango de días, dos tramos y el sábado', () => {
    const s = interpretarHorarios(TEXTO)
    for (const d of [1, 2, 3, 4, 5]) expect(s[d]).toEqual([[8, 12], [15.5, 19.5]])
    expect(s[6]).toEqual([[9, 13]])
    expect(s[0]).toEqual([])
  })
  it('lista de días y un día cerrado', () => {
    const s = interpretarHorarios('Lunes, miércoles y viernes de 9 a 18; domingos cerrado')
    expect([s[1], s[3], s[5]]).toEqual([[[9, 18]], [[9, 18]], [[9, 18]]])
    expect([s[2], s[4], s[6], s[0]]).toEqual([[], [], [], []])
  })
  it('lo por defecto de la página (con 12:30 y 16)', () => {
    expect(interpretarHorarios('Lun a Vie · 8 a 12:30 h y 16 a 20 h · Sáb 9 a 13 h')[3]).toEqual([[8, 12.5], [16, 20]])
  })
  it('un texto sin días devuelve null', () => {
    expect(interpretarHorarios('consultar')).toBeNull()
    expect(interpretarHorarios('')).toBeNull()
  })
})

describe('estaAbierto', () => {
  const q = (o) => estaAbierto(TEXTO, o, VIERNES)
  it('mañana sábado a las 10: abierto', () => expect(q({ dia: 'mañana', hora: '10:00' })).toMatchObject({ abierto: true, dia: 'sábado', fecha: '2026-11-28' }))
  it('mañana sábado a las 15: cerrado, abre el lunes', () => expect(q({ dia: 'mañana', hora: '15' })).toMatchObject({ abierto: false, proxima_apertura: 'lunes 8 h' }))
  it('el domingo: cerrado todo el día', () => expect(q({ dia: 'domingo', hora: '11' })).toMatchObject({ abierto: false, horario_del_dia: 'cerrado', proxima_apertura: 'lunes 8 h' }))
  it('hoy a las 13 (entre los dos tramos): cerrado, abre 15:30', () => expect(q({ dia: 'hoy', hora: '13:00' })).toMatchObject({ abierto: false, proxima_apertura: 'viernes 15:30 h' }))
  it('el límite: abre a las 8 y cierra a las 12 (las 12 ya no)', () => {
    expect(q({ dia: 'lunes', hora: '8:00' }).abierto).toBe(true)
    expect(q({ dia: 'lunes', hora: '12:00' }).abierto).toBe(false)
  })
  it('una fecha y sin hora: solo cuenta el día', () => {
    expect(q({ dia: '2026-11-29' }).abierto).toBe(false)
    expect(q({ dia: '30/11' })).toMatchObject({ abierto: true, dia: 'lunes' })
  })
  it('pasado mañana, y errores claros', () => {
    expect(q({ dia: 'pasado mañana', hora: '10' }).dia).toBe('domingo')
    expect(q({ dia: 'xx' }).error).toBe('dia_invalido')
    expect(q({ dia: 'hoy', hora: '25:00' }).error).toBe('hora_invalida')
    expect(estaAbierto('consultar', { dia: 'hoy' }, VIERNES).error).toBe('horario_no_interpretable')
  })
  it('usa la hora de Argentina (a las 2:00 UTC del sábado todavía es viernes a la noche)', () => {
    expect(estaAbierto(TEXTO, { dia: 'hoy' }, Date.UTC(2026, 10, 28, 2, 0)).dia).toBe('viernes')
  })
})
