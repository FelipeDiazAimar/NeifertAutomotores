import { DIR_PRUEBA } from './entorno.js'
import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

// El servidor corre con una línea: cada número tiene sus datos aparte.
process.env.WHATSAPP_NUMERO = '5491111111111'
let config, archivos, almacen
beforeAll(async () => {
  config = await import('../src/config.js')
  archivos = await import('../src/archivos.js')
  almacen = await import('../src/almacen.js')
})

describe('datos por línea (número de WhatsApp)', () => {
  it('la línea sale de WHATSAPP_NUMERO y tiene su carpeta', () => {
    expect(config.LINEA).toBe('5491111111111')
    expect(config.LINEA_DIR).toBe(path.join(DIR_PRUEBA, 'lineas', '5491111111111'))
    expect(almacen.AUTH_DIR).toBe(path.join(config.LINEA_DIR, 'sesion'))
  })

  it('los archivos de la línea van bajo lineas/<número>/; las actualizaciones (app/) son comunes', () => {
    expect(archivos.fisica('media/Juan (+549…)/A.jpg')).toBe('lineas/5491111111111/media/Juan (+549…)/A.jpg')
    expect(archivos.fisica('respaldo/sesion.enc')).toBe('lineas/5491111111111/respaldo/sesion.enc')
    expect(archivos.fisica('app/servidor/ultima.json')).toBe('app/servidor/ultima.json')
  })

  it('se guardan en la carpeta de la línea y se listan con su clave de siempre', async () => {
    await archivos.guardar('media/chat/X1.jpg', Buffer.from('foto'), 'image/jpeg')
    expect(fs.existsSync(path.join(DIR_PRUEBA, 'lineas', '5491111111111', 'media', 'chat', 'X1.jpg'))).toBe(true)
    const lista = await archivos.listarArchivos('media/')
    expect(lista.map((a) => a.clave)).toEqual(['media/chat/X1.jpg'])
    expect((await archivos.leer('media/chat/X1.jpg')).toString()).toBe('foto')
  })

  it('lo de otra línea no se ve', async () => {
    const otra = path.join(DIR_PRUEBA, 'lineas', '5492222222222', 'media', 'chat')
    fs.mkdirSync(otra, { recursive: true })
    fs.writeFileSync(path.join(otra, 'Y1.jpg'), 'de otra línea')
    expect((await archivos.listarArchivos('media/')).map((a) => a.clave)).toEqual(['media/chat/X1.jpg'])
    expect(await archivos.leer('media/chat/Y1.jpg')).toBe(null)
  })
})
