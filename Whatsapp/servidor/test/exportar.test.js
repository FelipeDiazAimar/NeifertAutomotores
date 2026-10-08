import zlib from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { carpetaDeChat, crearZip, exportarConArchivos, nombreArchivo, textoDeChat, zipEnVivo } from '../src/exportar.js'

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
    const crudo = buf.subarray(inicio, inicio + comprimido)
    const datos = buf.readUInt16LE(p + 10) === 8 ? zlib.inflateRawSync(crudo) : crudo
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

  it('con los archivos: una carpeta por número con el chat y sus archivos, nombrados en el texto', async () => {
    const trozos = []
    const destino = { destroyed: false, write: (b) => trozos.push(Buffer.from(b)) && true, end: () => {}, once: () => {} }
    const chats = [
      { id: '5493564111111@s.whatsapp.net', nombre: 'Juan Pérez', telefono: '+5493564111111', esGrupo: false },
      { id: '1203@g.us', nombre: 'Ventas', esGrupo: true },
    ]
    const mensajes = {
      [chats[0].id]: [
        { id: 'a', ts: ts('2026-10-06T14:05:00'), deMi: false, tipo: 'nota_voz', media: { estado: 'ok', archivo: 'a.ogg' } },
        { id: 'b', ts: ts('2026-10-06T14:06:00'), deMi: true, tipo: 'documento', texto: '', media: { estado: 'ok', archivo: 'b.pdf', nombre: 'Presupuesto.pdf' } },
        { id: 'c', ts: ts('2026-10-06T14:07:00'), deMi: false, tipo: 'imagen', media: { estado: 'pendiente' } },
        { id: 'd', ts: ts('2026-10-06T14:08:00'), deMi: false, tipo: 'sticker', media: { estado: 'ok', archivo: 'd.webp' } },
      ],
      [chats[1].id]: [{ id: 'e', ts: ts('2026-10-06T10:00:00'), deMi: false, tipo: 'texto', texto: 'hola', autorNombre: 'Nico' }],
    }
    const guardados = { 'a.ogg': Buffer.from('OggS audio'), 'b.pdf': Buffer.from('%PDF') }
    const zip = zipEnVivo(destino)
    const r = await exportarConArchivos(zip, chats, {
      mensajesDe: (id) => mensajes[id],
      leerMedia: async (_id, m) => guardados[m.media.archivo] || null,
    })
    await zip.terminar()
    const archivos = leerZip(Buffer.concat(trozos))
    expect(r).toEqual({ archivos: 2, faltan: 1 })
    expect(Object.keys(archivos).sort()).toEqual([
      '5493564111111 - Juan Pérez/2026-10-06 14.05.00 Nota de voz.ogg',
      '5493564111111 - Juan Pérez/2026-10-06 14.06.00 Presupuesto.pdf',
      '5493564111111 - Juan Pérez/Chat de WhatsApp.txt',
      'Grupo - Ventas/Chat de WhatsApp.txt',
    ])
    expect(archivos['5493564111111 - Juan Pérez/2026-10-06 14.05.00 Nota de voz.ogg']).toBe('OggS audio')
    const texto = archivos['5493564111111 - Juan Pérez/Chat de WhatsApp.txt']
    expect(texto).toContain('14:05 - Juan Pérez: <Nota de voz: 2026-10-06 14.05.00 Nota de voz.ogg (archivo adjunto)>')
    expect(texto).toContain('14:07 - Juan Pérez: <Foto>')
  })

  it('la carpeta no termina en punto ni repite el número como nombre', () => {
    expect(carpetaDeChat({ nombre: 'Juan Jr.', telefono: '+54 9 11', esGrupo: false })).toBe('54911 - Juan Jr')
    expect(carpetaDeChat({ nombre: '+54 9 11', telefono: '+54 9 11', esGrupo: false })).toBe('54911')
  })
})
