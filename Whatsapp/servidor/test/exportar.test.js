import zlib from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { crearZip, nombreArchivo, textoDeChat } from '../src/exportar.js'

const ts = (iso) => new Date(iso).getTime() / 1000

/** Lee un .zip armado por crearZip (desde el directorio central) → { nombre: texto }. */
function leerZip(buf) {
  const fin = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const cantidad = buf.readUInt16LE(fin + 10)
  let p = buf.readUInt32LE(fin + 16)
  const archivos = {}
  for (let i = 0; i < cantidad; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50)
    const comprimido = buf.readUInt32LE(p + 20)
    const largoNombre = buf.readUInt16LE(p + 28)
    const local = buf.readUInt32LE(p + 42)
    const nombre = buf.subarray(p + 46, p + 46 + largoNombre).toString('utf8')
    const inicio = local + 30 + buf.readUInt16LE(local + 26)
    const datos = zlib.inflateRawSync(buf.subarray(inicio, inicio + comprimido))
    expect(zlib.crc32(datos)).toBe(buf.readUInt32LE(p + 16))
    archivos[nombre] = datos.toString('utf8')
    p += 46 + largoNombre
  }
  return archivos
}

describe('exportar chats', () => {
  it('arma el texto como "Exportar chat" del celular, con quién mandó cada mensaje', () => {
    const chat = { nombre: 'Juan Pérez', telefono: '+5493564111111', esGrupo: false }
    const texto = textoDeChat(chat, [
      { id: '1', ts: ts('2026-10-06T14:05:00'), deMi: false, tipo: 'texto', texto: 'Hola, ¿tienen el Corolla?' },
      { id: '2', ts: ts('2026-10-06T14:07:00'), deMi: true, tipo: 'texto', texto: 'Sí, pasá cuando quieras', enviadoPor: { id: 'u1', nombre: 'Bruno' } },
      { id: '3', ts: ts('2026-10-06T14:08:00'), deMi: false, tipo: 'documento', texto: '', media: { nombre: 'dni.pdf' } },
      { id: '4', ts: ts('2026-10-06T14:09:00'), deMi: false, tipo: 'texto', texto: 'perdón', eliminado: { por: 'contacto' } },
    ])
    expect(texto).toContain('Chat de WhatsApp con Juan Pérez (+5493564111111)')
    expect(texto).toContain('06/10/2026, 14:05 - Juan Pérez: Hola, ¿tienen el Corolla?')
    expect(texto).toContain('06/10/2026, 14:07 - Neifert (Bruno): Sí, pasá cuando quieras')
    expect(texto).toContain('14:08 - Juan Pérez: <Documento: dni.pdf>')
    expect(texto).toContain('14:09 - Juan Pérez: <Eliminado> perdón')
  })

  it('en un grupo pone el nombre de cada integrante', () => {
    const texto = textoDeChat({ nombre: 'Ventas', esGrupo: true }, [
      { id: '1', ts: ts('2026-10-06T10:00:00'), deMi: false, tipo: 'nota_voz', autorNombre: 'Nico' },
    ])
    expect(texto).toContain('10:00 - Nico: <Nota de voz>')
  })

  it('el nombre del archivo no tiene caracteres que Windows rechaza', () => {
    expect(nombreArchivo('Juan: "el del Gol" / 2026?', 'txt')).toBe('Juan el del Gol 2026.txt')
    expect(nombreArchivo('', 'txt')).toBe('chat.txt')
  })

  it('el .zip se abre: un .txt por chat, con tildes y sin pisar nombres repetidos', () => {
    const zip = crearZip([
      { nombre: 'José.txt', datos: 'hola ñandú' },
      { nombre: 'José.txt', datos: 'otro José' },
      { nombre: 'Ventas.txt', datos: 'x'.repeat(5000) },
    ])
    const archivos = leerZip(zip)
    expect(archivos).toEqual({ 'José.txt': 'hola ñandú', 'José (2).txt': 'otro José', 'Ventas.txt': 'x'.repeat(5000) })
  })
})
