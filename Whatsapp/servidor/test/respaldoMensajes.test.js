import { DIR_PRUEBA } from './entorno.js'
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { listarArchivos } from '../src/archivos.js'
import { claveDeDia, destinatariosAviso, respaldarMensajes, revisarRespaldoMensajes, vistaRespaldoMensajes } from '../src/respaldoMensajes.js'

const CLAVE = 'clave larga de prueba'
const ts = (iso) => new Date(iso).getTime() / 1000
const CHATS = [
  { id: '5493564111111@s.whatsapp.net', nombre: 'Juan Pérez', telefono: '+5493564111111', esGrupo: false },
  { id: '5493564222222@s.whatsapp.net', nombre: 'María', telefono: '+5493564222222', esGrupo: false },
  { id: 'vacio@s.whatsapp.net', nombre: 'Sin mensajes', telefono: '', esGrupo: false },
]
const MENSAJES = {
  [CHATS[0].id]: [
    { id: '1', ts: ts('2026-10-06T14:05:00'), deMi: false, tipo: 'texto', texto: 'Hola, ¿tienen el Corolla?' },
    { id: '2', ts: ts('2026-10-06T14:07:00'), deMi: true, tipo: 'texto', texto: 'Sí\ny pasá cuando quieras', enviadoPor: { nombre: 'Bruno' } },
    { id: '3', ts: ts('2026-10-06T14:08:00'), deMi: false, tipo: 'sistema', texto: '' },
  ],
  [CHATS[1].id]: [{ id: '4', ts: ts('2026-10-07T09:00:00'), deMi: false, tipo: 'imagen', texto: 'mirá', media: { estado: 'ok', archivo: 'a.jpg' } }],
  [CHATS[2].id]: [],
}
const base = { activo: true, clave: CLAVE, chats: () => CHATS, mensajesDe: (id) => MENSAJES[id] }
const archivoEstado = () => path.join(DIR_PRUEBA, 'lineas', 'sin-numero', 'respaldo-mensajes.json')

const USUARIOS = [
  { id: 'u-admin', usuario: 'feli', rol: 'admin' },
  { id: 'u-dueno', usuario: 'dueno', rol: 'dueno' },
  { id: 'u-vend', usuario: 'nico', rol: 'vendedor', telefono: '3564 62-7834' },
  { id: 'u-bruno', usuario: 'bruno', rol: 'vendedor', telefono: '3564 67-6445' },
]
let alertas
beforeAll(() =>
  vi.stubGlobal('fetch', async (url, opts = {}) => {
    const u = new URL(url)
    const tabla = u.pathname.split('/rest/v1/')[1]
    if (opts.method === 'POST' && tabla === 'alertas') {
      const fila = JSON.parse(opts.body)
      alertas.push(fila)
      return Response.json([{ id: alertas.length, ...fila }])
    }
    return Response.json(tabla === 'usuarios' ? USUARIOS : [])
  }),
)
afterAll(() => vi.unstubAllGlobals())
beforeEach(() => {
  alertas = []
  fs.rmSync(archivoEstado(), { force: true })
})

describe('respaldo de mensajes', () => {
  it('ida y vuelta: exporta, cifra, guarda, descifra y lee con los mismos chats y mensajes', async () => {
    const r = await respaldarMensajes({ ...base, ahora: new Date('2026-11-24T12:00:00Z') })
    expect(r).toMatchObject({ verificado: true, chats: 3, mensajes: 3, error: null, clave: claveDeDia('2026-11-24') })
    expect(r.bytes).toBeGreaterThan(0)
    expect(vistaRespaldoMensajes(true)).toMatchObject({ ultimoOk: '2026-11-24T12:00:00.000Z', activo: true, corriendo: false })
  })

  it('las charlas de Sofía van en un respaldo aparte', async () => {
    const sofia = { [CHATS[0].id]: [{ id: 'sofia:a', ts: ts('2026-10-06T23:00:00'), deMi: true, tipo: 'texto', texto: 'Hola, soy Sofía', sofia: { rol: 'bot', asistente: 'Sofía' } }] }
    const r = await respaldarMensajes({ ...base, mensajesSofia: (id) => sofia[id] || [], ahora: new Date('2026-11-25T12:00:00Z') })
    expect(r).toMatchObject({ chats: 3, mensajes: 3, sofia: { chats: 1, mensajes: 1, clave: 'respaldo/sofia/2026-11-25.enc' } })
    expect((await listarArchivos('respaldo/sofia/')).map((a) => a.clave)).toEqual(['respaldo/sofia/2026-11-25.enc'])
  })

  it('si lo que se lee de vuelta está dañado, no cuenta como bueno', async () => {
    const original = fs.readFileSync
    // Se corrompe lo que se lee de vuelta: la verificación tiene que fallar y quedar anotado.
    const espia = vi.spyOn(fs, 'readFileSync').mockImplementation((f, ...a) => {
      const datos = original(f, ...a)
      return String(f).includes(`mensajes${path.sep}`) && Buffer.isBuffer(datos) ? Buffer.concat([datos.subarray(0, -1), Buffer.from([datos.at(-1) ^ 1])]) : datos
    })
    try {
      await expect(respaldarMensajes({ ...base, ahora: new Date('2026-11-25T12:00:00Z') })).rejects.toThrow()
    } finally {
      espia.mockRestore()
    }
    expect(vistaRespaldoMensajes(true)).toMatchObject({ verificado: false, ultimoOk: null })
    expect(vistaRespaldoMensajes(true).error).toBeTruthy()
  })

  it('conserva solo los últimos 15', async () => {
    for (let i = 1; i <= 17; i++) await respaldarMensajes({ ...base, ahora: new Date(Date.UTC(2027, 0, i, 12)) })
    const claves = (await listarArchivos('respaldo/mensajes/')).map((a) => a.clave).sort()
    expect(claves).toHaveLength(15)
    expect(claves[0]).toBe(claveDeDia('2027-01-03'))
    expect(claves.at(-1)).toBe(claveDeDia('2027-01-17'))
  })
})

describe('aviso si los respaldos se atrasan', () => {
  const opciones = { ...base, configurado: true }

  it('avisa a admin, dueño y a los de WA_RESPALDO_AVISAR_A (usuario o teléfono), no a otros vendedores', () => {
    const ids = (extra) => destinatariosAviso(USUARIOS, extra).map((u) => u.id)
    expect(ids('')).toEqual(['u-admin', 'u-dueno'])
    expect(ids('Bruno')).toEqual(['u-admin', 'u-dueno', 'u-bruno'])
    expect(ids('+54 9 3564 676445')).toEqual(['u-admin', 'u-dueno', 'u-bruno'])
  })

  it('crea una alerta por admin/dueño y no repite antes de 24 h', async () => {
    // Nunca hubo uno bueno y este falla: no hay con qué respaldar.
    const falla = { ...opciones, mensajesDe: () => { throw new Error('base caída') } }
    const t0 = new Date('2027-02-01T12:00:00Z')
    await revisarRespaldoMensajes({ ...falla, ahora: t0 })
    expect(alertas).toHaveLength(2)
    expect(alertas.map((a) => a.asignado_a)).toEqual(['u-admin', 'u-dueno'])
    expect(alertas[0]).toMatchObject({ titulo: 'Respaldo de WhatsApp atrasado', fecha: '2027-02-01', hora: '09:00', creado_por: null })
    expect(alertas[0].descripcion).toContain('nunca')
    expect(alertas[0].descripcion).toContain('base caída')

    await revisarRespaldoMensajes({ ...falla, ahora: new Date(t0.getTime() + 3600e3) })
    expect(alertas).toHaveLength(2)
    await revisarRespaldoMensajes({ ...falla, ahora: new Date(t0.getTime() + 25 * 3600e3) })
    expect(alertas).toHaveLength(4)
  })

  it('con un respaldo reciente no respalda de nuevo ni avisa', async () => {
    const t0 = new Date('2027-03-01T12:00:00Z')
    await respaldarMensajes({ ...base, ahora: t0 })
    const r = await revisarRespaldoMensajes({ ...opciones, ahora: new Date(t0.getTime() + 3600e3) })
    expect(r.ultimoOk).toBe(t0.toISOString())
    expect(alertas).toHaveLength(0)
  })

  it('con más de 2 días hace otro respaldo', async () => {
    const t0 = new Date('2027-04-01T12:00:00Z')
    await respaldarMensajes({ ...base, ahora: t0 })
    const t1 = new Date(t0.getTime() + 49 * 3600e3)
    const r = await revisarRespaldoMensajes({ ...opciones, ahora: t1 })
    expect(r.ultimoOk).toBe(t1.toISOString())
    expect(alertas).toHaveLength(0)
  })

  it('sin respaldo activo no hace nada y no avisa', async () => {
    expect(await revisarRespaldoMensajes({ ...opciones, activo: false, ahora: new Date('2027-05-01T12:00:00Z') })).toBeNull()
    expect(alertas).toHaveLength(0)
    expect(vistaRespaldoMensajes(false)).toMatchObject({ activo: false, ultimoOk: null })
  })
})
