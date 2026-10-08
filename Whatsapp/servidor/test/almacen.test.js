import './entorno.js'
import { describe, expect, it } from 'vitest'
import * as a from '../src/almacen.js'

const ahora = Math.floor(Date.now() / 1000)
const DIA = 86400
const msg = (id, ts, extra = {}) => ({ id, ts, deMi: false, tipo: 'texto', texto: `Mensaje ${id}`, origen: 'vivo', ...extra })

describe('almacén de mensajes (modo local)', () => {
  const JID = '5493406000001@s.whatsapp.net'

  it('ordena por hora aunque lleguen desordenados', () => {
    a.agregarMensaje(JID, msg('B', ahora - 100))
    a.agregarMensaje(JID, msg('A', ahora - 200))
    a.agregarMensaje(JID, msg('C', ahora - 50))
    expect(a.listarMensajes(JID).map((m) => m.id)).toEqual(['A', 'B', 'C'])
    expect(a.buscarChat(JID).ultimo.id).toBe('C')
  })

  it('un duplicado no se agrega dos veces, pero completa lo que faltaba', () => {
    const r = a.agregarMensaje(JID, msg('B', ahora - 100, { autorNombre: 'Juan' }))
    expect(r.nuevo).toBe(false)
    expect(a.listarMensajes(JID)).toHaveLength(3)
    expect(a.buscarMensaje(JID, 'B').autorNombre).toBe('Juan')
  })

  it('un mensaje viejo (del historial) no pisa la vista previa del chat', () => {
    a.agregarMensaje(JID, msg('VIEJO', ahora - 5000, { origen: 'historial' }))
    expect(a.buscarChat(JID).ultimo.id).toBe('C')
  })

  it('pagina hacia atrás sin repetir ni saltear', () => {
    const J = '5493406000002@s.whatsapp.net'
    for (let i = 0; i < 25; i++) a.agregarMensaje(J, msg(`P${String(i).padStart(2, '0')}`, ahora - 1000 + i))
    const p1 = a.paginaDeMensajes(J, { limite: 10 })
    expect(p1.mensajes.map((m) => m.id)).toEqual(Array.from({ length: 10 }, (_, i) => `P${15 + i}`))
    expect(p1).toMatchObject({ hayAnteriores: true, total: 25 })
    const p2 = a.paginaDeMensajes(J, { limite: 10, antes: p1.mensajes[0].id })
    expect(p2.mensajes.at(-1).id).toBe('P14')
    const p3 = a.paginaDeMensajes(J, { limite: 10, antes: p2.mensajes[0].id })
    expect(p3.mensajes.map((m) => m.id)).toEqual(['P00', 'P01', 'P02', 'P03', 'P04'])
    expect(p3.hayAnteriores).toBe(false)
  })

  it('busca sin acentos ni mayúsculas, paginado', () => {
    const J = '5493406000003@s.whatsapp.net'
    for (let i = 0; i < 7; i++) a.agregarMensaje(J, msg(`S${i}`, ahora - 100 + i, { texto: `Consulta por la Amárok ${i}` }))
    const r1 = a.buscarMensajes('amarok', { jid: J, limite: 5 })
    expect(r1.resultados).toHaveLength(5)
    expect(r1).toMatchObject({ truncado: true, total: 7 })
    expect(r1.resultados[0].id).toBe('S6') // lo más nuevo primero
    const r2 = a.buscarMensajes('amarok', { jid: J, limite: 5, desde: 5 })
    expect(r2.resultados.map((m) => m.id)).toEqual(['S1', 'S0'])
    expect(r2.truncado).toBe(false)
    expect(a.buscarMensajes('a').resultados).toEqual([]) // muy corto
  })

  it('ventana de 365 días: borra lo anterior y los chats que quedan vacíos, no los grupos', () => {
    const VIEJO = '5493406000004@s.whatsapp.net'
    const GRUPO = '120363000000000001@g.us'
    a.agregarMensaje(VIEJO, msg('V1', ahora - 400 * DIA))
    a.agregarMensaje(GRUPO, msg('G1', ahora - 400 * DIA))
    a.agregarMensaje(JID, msg('ANTIGUO', ahora - 366 * DIA))
    const corte = ahora - 365 * DIA
    const { quitados, chats } = a.quitarAnterioresA(corte)
    expect(quitados.map((q) => q.m.id).sort()).toEqual(['ANTIGUO', 'G1', 'V1'])
    expect(chats).toBe(1)
    expect(a.existeChat(VIEJO)).toBe(false)
    expect(a.existeChat(GRUPO)).toBe(true) // la línea sigue en el grupo
    expect(a.listarMensajes(JID).map((m) => m.id)).toEqual(['VIEJO', 'A', 'B', 'C'])
  })

  it('quitar un mensaje suelto deja como vista previa el anterior', () => {
    a.quitarMensaje(JID, 'C')
    expect(a.buscarChat(JID).ultimo.id).toBe('B')
  })

  it('la carpeta de archivos lleva nombre y número, sin caracteres inválidos', () => {
    const J = '5493406000005@s.whatsapp.net'
    a.setContacto(J, { nombre: 'Juan/Pérez: "Taller"' })
    a.agregarMensaje(J, msg('F1', ahora))
    a.guardarMedia(J, 'F1.jpg', Buffer.from('foto'), 'image/jpeg')
    expect(a.claveMedia(J, 'F1.jpg')).toBe('media/Juan Pérez Taller (+5493406000005)/F1.jpg')
    // El contacto se cambia el nombre: la carpeta queda la misma.
    a.setContacto(J, { nombre: 'Juan P.' })
    expect(a.claveMedia(J, 'F1.jpg')).toBe('media/Juan Pérez Taller (+5493406000005)/F1.jpg')
  })
})
