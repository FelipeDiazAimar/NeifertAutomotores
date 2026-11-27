import './entorno.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { describe, expect, it } from 'vitest'
import { crearCifrador, descifrarArchivo, esRespaldoCifrado } from '../src/cifradoFlujo.js'
import { exportarConArchivos, zipEnVivo } from '../src/exportar.js'

const CLAVE = 'clave larga de prueba para el respaldo'
const a = await import('../src/almacen.js')
const { importarRespaldo, entradasZip } = await import('../src/importar.js')

const ahora = Math.floor(Date.now() / 1000)
const FOTO = Buffer.from('FOTO-DE-PRUEBA-'.repeat(50000)) // ~750 KB: más de un trozo no, pero con contenido reconocible
const chats = [
  { id: '5493564888001@s.whatsapp.net', nombre: 'Marta', telefono: '+5493564888001', esGrupo: false },
  { id: '5493564888002@s.whatsapp.net', nombre: 'Pablo', telefono: '+5493564888002', esGrupo: false },
]
const mensajes = {
  [chats[0].id]: [
    { id: 'm1', ts: ahora - 3000, deMi: false, tipo: 'texto', texto: 'Hola, quiero ver el Corolla' },
    { id: 'm2', ts: ahora - 2900, deMi: true, tipo: 'imagen', texto: 'Mirá', media: { estado: 'ok', archivo: 'foto1.jpg', mime: 'image/jpeg' } },
  ],
  [chats[1].id]: [{ id: 'm3', ts: ahora - 2800, deMi: false, tipo: 'texto', texto: 'Buenas tardes, ¿financian?' }],
}

/** Lo mismo que hace GET /api/exportar: el .zip en vivo, cifrado de a trozos, a un archivo. */
async function exportarCifrado(destino) {
  const cifrador = crearCifrador(CLAVE)
  const archivo = fs.createWriteStream(destino)
  cifrador.pipe(archivo)
  const zip = zipEnVivo(cifrador)
  const r = await exportarConArchivos(zip, chats, { mensajesDe: (id) => mensajes[id], leerMedia: async (_id, m) => (m.media.archivo === 'foto1.jpg' ? FOTO : null) })
  await zip.terminar()
  await once(archivo, 'finish')
  return r
}

describe('respaldo local: completo y cifrado', () => {
  it('sale cifrado, con todos los chats y sus archivos, y se puede volver a abrir', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-local-'))
    const enc = path.join(dir, 'respaldo.enc')
    const r = await exportarCifrado(enc)
    expect(r.archivos).toBe(1)

    const bytes = fs.readFileSync(enc)
    expect(esRespaldoCifrado(enc)).toBe(true)
    // Ni los mensajes ni las fotos se ven en lo que se guarda.
    expect(bytes.includes(Buffer.from('Corolla'))).toBe(false)
    expect(bytes.includes(Buffer.from('FOTO-DE-PRUEBA'))).toBe(false)

    const zip = path.join(dir, 'respaldo.zip')
    await descifrarArchivo(enc, zip, CLAVE)
    const entradas = entradasZip(zip)
    try {
      const rutas = entradas.map((e) => e.ruta)
      expect(rutas.filter((x) => x.endsWith('Chat de WhatsApp.txt'))).toHaveLength(2)
      const foto = entradas.find((e) => /Foto/.test(e.ruta) && e.ruta.endsWith('.jpg'))
      expect(foto, rutas.join(' | ')).toBeTruthy()
      expect(Buffer.compare(foto.leer(), FOTO)).toBe(0)
    } finally {
      entradas.cerrar()
    }
  })

  it('cargarlo en otro historial (como "Cargar respaldo") devuelve los mensajes y el archivo', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-local-'))
    const enc = path.join(dir, 'respaldo.enc')
    await exportarCifrado(enc)
    const zip = path.join(dir, 'respaldo.zip')
    await descifrarArchivo(enc, zip, CLAVE)
    // Los chats todavía no existen en este historial: el respaldo los vuelve a crear.
    const r = await importarRespaldo(zip, { nombreArchivo: 'respaldo.zip' })
    expect(r.salteados).toEqual([])
    expect(r.mensajes).toBe(3)
    expect(r.archivos).toBe(1)
    expect(a.listarMensajes(chats[0].id).map((m) => m.texto).join('|')).toContain('Corolla')
    const conFoto = a.listarMensajes(chats[0].id).find((m) => m.media?.archivo)
    expect(conFoto.media.estado).toBe('ok')
    // Cargarlo de nuevo no suma nada (los respaldos locales se pueden repetir).
    const otra = await importarRespaldo(zip, { nombreArchivo: 'respaldo.zip' })
    expect(otra.mensajes).toBe(0)
  })

  it('un respaldo cortado a medio bajar no se puede abrir', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-local-'))
    const enc = path.join(dir, 'respaldo.enc')
    await exportarCifrado(enc)
    const entero = fs.readFileSync(enc)
    fs.writeFileSync(enc, entero.subarray(0, Math.floor(entero.length / 2)))
    await expect(descifrarArchivo(enc, path.join(dir, 'x.zip'), CLAVE)).rejects.toThrow()
  })
})
