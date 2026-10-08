import { describe, expect, it } from 'vitest'
import { categoriaDe, extensionDe, mimeDe } from '../src/tipos.js'

describe('tipos de archivo', () => {
  it('extensión según el MIME (con parámetros)', () => {
    expect(extensionDe('audio/ogg; codecs=opus')).toBe('ogg')
    expect(extensionDe('image/jpeg')).toBe('jpg')
    expect(extensionDe('video/mp4')).toBe('mp4')
    expect(extensionDe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('docx')
  })
  it('la extensión del nombre manda; sin nada conocido, "bin"', () => {
    expect(extensionDe('application/octet-stream', 'presupuesto.XLSX')).toBe('xlsx')
    expect(extensionDe('', '')).toBe('bin')
  })
  it('MIME desde el nombre o la clave de R2', () => {
    expect(mimeDe('media/Juan (+549…)/ABC.jpg')).toBe('image/jpeg')
    expect(mimeDe('x.pdf')).toBe('application/pdf')
    expect(mimeDe('x.webm')).toMatch(/webm/)
  })
  it('categoría para el uso de espacio', () => {
    expect(categoriaDe('a.jpg')).toBe('fotos')
    expect(categoriaDe('a.mkv')).toBe('videos')
    expect(categoriaDe('a.ogg')).toBe('audios')
    expect(categoriaDe('a.docx')).toBe('documentos')
    expect(categoriaDe('sin-extension')).toBe('documentos')
  })
})
