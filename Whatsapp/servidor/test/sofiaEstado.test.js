import './entorno.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { guardarCharla } from '../src/sofia.js'
import { SIN_SENAL_MS, _reiniciar, calcularEstadisticas, conexionDe, estadisticasActuales, guardarReporte, limpiarReporte, vistaSofia } from '../src/sofiaEstado.js'

// Argentina = UTC-3. Lunes 7/12/2026 a las 21:00 en Argentina.
const ar = (iso) => new Date(`${iso}-03:00`).getTime()
const seg = (iso) => Math.floor(ar(iso) / 1000)
const AHORA = ar('2026-12-07T22:00:00')

const cliente = (iso, texto) => ({ ts: seg(iso), rol: 'cliente', texto })
const bot = (iso, texto, derivo = false) => ({ ts: seg(iso), rol: 'bot', texto, derivo })

describe('recuento de lo que atendió Sofía', () => {
  const chats = [
    { id: 'A', mensajes: [cliente('2026-12-07T21:00:00', 'Hola'), bot('2026-12-07T21:00:05', '¡Hola! ¿En qué te ayudo?'), cliente('2026-12-07T21:05:00', '¿Tienen Toyota?'), bot('2026-12-07T21:05:09', 'Sí, tenemos dos.')] },
    { id: 'B', mensajes: [cliente('2026-12-07T21:30:00', 'Quiero hablar con alguien'), bot('2026-12-07T21:30:07', 'Te paso con un asesor', true)] },
    // De otro día del mismo mes, y de un mes anterior.
    { id: 'C', mensajes: [cliente('2026-12-03T10:00:00', 'Buenas'), bot('2026-12-03T10:00:04', 'Hola')] },
    { id: 'D', mensajes: [cliente('2026-11-20T10:00:00', 'Consulta'), bot('2026-11-20T10:00:04', 'Respuesta larga de prueba')] },
  ]

  it('hoy, este mes y el total: clientes, conversaciones, mensajes y caracteres', () => {
    const r = calcularEstadisticas(chats, AHORA)
    expect(r.hoy).toEqual({ clientes: 2, conversaciones: 2, mensajesCliente: 3, mensajesSofia: 3, caracteresCliente: 'Hola'.length + '¿Tienen Toyota?'.length + 'Quiero hablar con alguien'.length, caracteresSofia: '¡Hola! ¿En qué te ayudo?'.length + 'Sí, tenemos dos.'.length + 'Te paso con un asesor'.length, derivadas: 1 })
    expect(r.mes).toMatchObject({ clientes: 3, conversaciones: 3, mensajesCliente: 4, mensajesSofia: 4, derivadas: 1 })
    expect(r.total).toMatchObject({ clientes: 4, conversaciones: 4, mensajesCliente: 5, mensajesSofia: 5 })
    expect(r.total.caracteresSofia).toBeGreaterThan(r.mes.caracteresSofia)
  })

  it('una conversación nueva es después de 12 horas sin hablar', () => {
    const r = calcularEstadisticas([{ id: 'X', mensajes: [cliente('2026-12-07T08:00:00', 'a'), bot('2026-12-07T08:00:03', 'b'), cliente('2026-12-07T22:00:00', 'c')] }], AHORA)
    expect(r.hoy.conversaciones).toBe(2)
    expect(r.hoy.clientes).toBe(1)
  })

  it('el día se cuenta en hora de Argentina', () => {
    // 23:30 del domingo 6/12 en Argentina es lunes en UTC: igual es del domingo.
    const r = calcularEstadisticas([{ id: 'X', mensajes: [cliente('2026-12-06T23:30:00', 'tarde')] }], AHORA)
    expect(r.hoy.mensajesCliente).toBe(0)
    expect(r.porDia.find((d) => d.dia === '2026-12-06').mensajes).toBe(1)
  })

  it('los últimos 30 días, aunque no haya habido nada', () => {
    const r = calcularEstadisticas(chats, AHORA)
    expect(r.porDia).toHaveLength(30)
    expect(r.porDia.at(-1)).toEqual({ dia: '2026-12-07', clientes: 2, mensajes: 6 })
    expect(r.porDia.find((d) => d.dia === '2026-12-05')).toEqual({ dia: '2026-12-05', clientes: 0, mensajes: 0 })
    expect(r.desde).toBe(ar('2026-11-20T10:00:00'))
  })

  it('sin charlas no rompe', () => {
    const r = calcularEstadisticas([], AHORA)
    expect(r.total.clientes).toBe(0)
    expect(r.desde).toBeNull()
    expect(r.porDia).toHaveLength(30)
  })
})

describe('conexión del bot según su último reporte', () => {
  const base = { vinculado: true, conectado: true, activo: true, horario: { activo: true, dentro: false }, recibidoEn: AHORA - 20_000 }

  it('conectado y respondiendo; en horario de atención está conectado pero no responde', () => {
    expect(conexionDe(base, AHORA)).toMatchObject({ estado: 'conectado', respondiendo: true })
    expect(conexionDe({ ...base, horario: { activo: true, dentro: true } }, AHORA)).toMatchObject({ estado: 'conectado', respondiendo: false })
  })

  it('cada situación tiene su estado', () => {
    expect(conexionDe(null, AHORA).estado).toBe('nunca')
    expect(conexionDe({ ...base, recibidoEn: AHORA - SIN_SENAL_MS - 1000 }, AHORA).estado).toBe('sin_senal')
    expect(conexionDe({ ...base, vinculado: false }, AHORA).estado).toBe('sin_numero')
    expect(conexionDe({ ...base, conectado: false }, AHORA).estado).toBe('desconectado')
    expect(conexionDe({ ...base, activo: false }, AHORA).estado).toBe('apagado')
  })
})

describe('el reporte que manda el bot', () => {
  it('se limpia y se le ponen topes: lo que no se conoce no entra', () => {
    const r = limpiarReporte({ asistente: 'S'.repeat(200), conectado: 1, activo: 'si', atendiendo: -4, ia: { usadas: '12', cupo: 1500, porMinuto: 20, mes: '2026-12-extra', hack: 'x' }, ultimaFalla: { ts: 5, que: 'x'.repeat(500) }, version: '1.2.3', otro: 'no' })
    expect(r.asistente).toHaveLength(60)
    expect(r).toMatchObject({ conectado: true, activo: true, atendiendo: 0, version: '1.2.3' })
    expect(r.ia).toEqual({ usadas: 12, cupo: 1500, porMinuto: 20, mes: '2026-12' })
    expect(r.ultimaFalla.que).toHaveLength(200)
    expect('otro' in r).toBe(false)
    expect(limpiarReporte({}).ia).toBeNull()
  })

  describe('con charlas guardadas de verdad', () => {
    beforeEach(() => _reiniciar())

    it('lo que el bot manda a /api/bot/mensajes se cuenta, y el panel ve la conexión y el uso', async () => {
      const t = (iso) => ar(iso)
      guardarCharla({ telefono: '5493564111999', nombre: 'Lucía', asistente: 'Sofía', mensajes: [
        { id: 'c1', rol: 'cliente', texto: 'Hola, ¿tienen Hilux?', ts: t('2026-12-07T21:00:00') },
        { id: 'b1', rol: 'bot', texto: 'Sí, tenemos la Hilux SRX.', ts: t('2026-12-07T21:00:06') },
      ] })
      await guardarReporte({ asistente: 'Sofía', vinculado: true, conectado: true, activo: true, horario: { activo: true, texto: 'lunes a viernes, de 09:00 a 18:00 h', dentro: false }, atendiendo: 1, ia: { usadas: 130, cupo: 1500, porMinuto: 20, mes: '2026-12' }, version: '1.0.0' }, AHORA - 5000)
      const v = await vistaSofia(AHORA)
      expect(v.conexion).toMatchObject({ estado: 'conectado', respondiendo: true })
      expect(v.reporte.ia).toMatchObject({ usadas: 130, cupo: 1500 })
      expect(v.estadisticas.total).toMatchObject({ clientes: 1, mensajesCliente: 1, mensajesSofia: 1, caracteresCliente: 'Hola, ¿tienen Hilux?'.length })
      // Sin reporte nuevo por más de 3 minutos, se ve que el bot no da señal.
      expect((await vistaSofia(AHORA + 4 * 60_000)).conexion.estado).toBe('sin_senal')
    })

    it('el recuento no cuenta lo de la línea de Neifert, solo lo de Sofía', () => {
      expect(estadisticasActuales(AHORA, () => []).total.clientes).toBe(0)
    })
  })
})
