import './entorno.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { crearZip } from '../src/exportar.js'

const { entradasZip, interpretarCuerpo, leerChatTxt, nombreDesdeArchivo, tipoDeAdjunto } = await import('../src/importar.js')
const local = (a, m, d, h, mi, s = 0) => Math.floor(new Date(a, m - 1, d, h, mi, s).getTime() / 1000)

describe('cargar un respaldo: leer el texto', () => {
  it('la exportación de este sistema, con el número en el título y mensajes de varios renglones', () => {
    const { titulo, mensajes } = leerChatTxt(
      'Chat de WhatsApp con Juan Pérez (+5493564111111)\nExportado el 06/10/2026, 15:00 · 2 mensajes\n\n06/10/2026, 14:05 - Juan Pérez: Hola\nsegunda línea\n06/10/2026, 14:07 - Neifert (Bruno): <Foto: 2026-10-06 14.07.00 Foto.jpg (archivo adjunto)> mirá',
    )
    expect(titulo).toEqual({ nombre: 'Juan Pérez', telefono: '5493564111111' })
    expect(mensajes).toEqual([
      { ts: local(2026, 10, 6, 14, 5), autor: 'Juan Pérez', cuerpo: 'Hola\nsegunda línea' },
      { ts: local(2026, 10, 6, 14, 7), autor: 'Neifert (Bruno)', cuerpo: '<Foto: 2026-10-06 14.07.00 Foto.jpg (archivo adjunto)> mirá' },
    ])
  })

  it('Android con a. m./p. m. y año corto, e iPhone con corchetes y caracteres invisibles', () => {
    const android = leerChatTxt('6/10/26, 2:05 p. m. - Juan: IMG-20261006-WA0001.jpg (archivo adjunto)\n6/10/26, 2:06 p. m. - Los mensajes están cifrados')
    expect(android.mensajes[0]).toEqual({ ts: local(2026, 10, 6, 14, 5), autor: 'Juan', cuerpo: 'IMG-20261006-WA0001.jpg (archivo adjunto)' })
    expect(android.mensajes[1].sistema).toBe(true)
    const iphone = leerChatTxt('‎[6/10/26, 14:05:33] Juan: ‎<adjunto: 00000012-AUDIO-2026-10-06-14-05-33.opus>')
    expect(iphone.mensajes[0]).toEqual({ ts: local(2026, 10, 6, 14, 5, 33), autor: 'Juan', cuerpo: '<adjunto: 00000012-AUDIO-2026-10-06-14-05-33.opus>' })
  })

  it('reconoce los adjuntos de cada formato y lo que no vino en el respaldo', () => {
    expect(interpretarCuerpo('<Nota de voz: a.ogg (archivo adjunto)>')).toEqual({ rotulo: 'Nota de voz', adjunto: 'a.ogg', texto: '' })
    expect(interpretarCuerpo('DOC-1.pdf (archivo adjunto)\npresupuesto')).toEqual({ adjunto: 'DOC-1.pdf', texto: 'presupuesto' })
    expect(interpretarCuerpo('<adjunto: 0001-PHOTO.jpg> hola')).toEqual({ adjunto: '0001-PHOTO.jpg', texto: 'hola' })
    expect(interpretarCuerpo('<Multimedia omitido>').tipo).toBe('otro')
    expect(interpretarCuerpo('<Eliminado> perdón <Editado>')).toEqual({ eliminado: true, editado: true, tipo: 'texto', texto: 'perdón' })
    expect(tipoDeAdjunto('00000012-AUDIO-2026.opus')).toEqual({ tipo: 'nota_voz', mime: 'audio/ogg; codecs=opus' })
    expect(tipoDeAdjunto('STK-1.webp').tipo).toBe('sticker')
    expect(tipoDeAdjunto('a.ogg', 'Audio').tipo).toBe('audio')
  })

  it('el nombre del chat sale del archivo del celular', () => {
    expect(nombreDesdeArchivo('Chat de WhatsApp con Juan Pérez.zip')).toBe('Juan Pérez')
    expect(nombreDesdeArchivo('WhatsApp Chat - Ventas.rar')).toBe('Ventas')
    expect(nombreDesdeArchivo('respaldo.zip')).toBeNull()
  })

  it('lee el .zip que arma la exportación (carpetas, tildes y archivos)', () => {
    const archivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'imp-')), 'r.zip')
    fs.writeFileSync(archivo, crearZip([{ nombre: '5491 - José/Chat de WhatsApp.txt', datos: 'hola ñandú' }, { nombre: '5491 - José/foto.jpg', datos: 'x'.repeat(3000) }]))
    const entradas = entradasZip(archivo)
    try {
      expect(entradas.map((e) => e.ruta)).toEqual(['5491 - José/Chat de WhatsApp.txt', '5491 - José/foto.jpg'])
      expect(entradas[0].leer().toString('utf8')).toBe('hola ñandú')
      expect(entradas[1].leer().length).toBe(3000)
    } finally {
      entradas.cerrar()
    }
  })
})

describe('cargar un respaldo: sumar al historial', async () => {
  const a = await import('../src/almacen.js')
  const { importarRespaldo } = await import('../src/importar.js')
  const hace = (min) => new Date(Date.now() - min * 60_000)
  const dos = (n) => String(n).padStart(2, '0')
  const linea = (d, autor, texto) => `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}, ${dos(d.getHours())}:${dos(d.getMinutes())} - ${autor}: ${texto}`
  const zip = (archivos) => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'imp-')), 'r.zip')
    fs.writeFileSync(f, crearZip(archivos))
    return f
  }

  it('suma lo que falta, guarda los archivos, no duplica y saltea grupos desconocidos', async () => {
    const JID = '5493564222222@s.whatsapp.net'
    const t1 = hace(30)
    // Ya estaba guardado: no se vuelve a cargar.
    a.agregarMensaje(JID, { id: 'REAL1', ts: Math.floor(t1.getTime() / 1000), deMi: false, tipo: 'texto', texto: 'Hola', origen: 'vivo' })
    const texto = [
      'Chat de WhatsApp con Ana (+5493564222222)',
      '',
      linea(t1, 'Ana', 'Hola'),
      linea(hace(20), 'Neifert (Bruno)', 'Te paso el presupuesto'),
      linea(hace(19), 'Neifert (Bruno)', '<Documento: 2026-10-06 14.07.00 Presupuesto.pdf (archivo adjunto)>'),
      linea(hace(10), 'Ana', '<Nota de voz: nota.ogg (archivo adjunto)>'),
    ].join('\n')
    const archivo = zip([
      { nombre: '5493564222222 - Ana/Chat de WhatsApp.txt', datos: texto },
      { nombre: '5493564222222 - Ana/2026-10-06 14.07.00 Presupuesto.pdf', datos: '%PDF-1.4' },
      { nombre: 'Grupo - Desconocido/Chat de WhatsApp.txt', datos: linea(hace(5), 'Nico', 'hola grupo') },
    ])
    const r = await importarRespaldo(archivo, { nombreArchivo: 'r.zip' })
    expect(r).toMatchObject({ chats: 1, mensajes: 3, archivos: 1, yaEstaban: 1, archivosFaltantes: 1 })
    expect(r.salteados).toHaveLength(1)
    const mensajes = a.listarMensajes(JID)
    expect(mensajes.map((m) => [m.deMi, m.tipo])).toEqual([[false, 'texto'], [true, 'texto'], [true, 'documento'], [false, 'otro']])
    expect(mensajes[1].enviadoPor).toEqual({ id: null, nombre: 'Bruno' })
    expect(mensajes[2].media).toMatchObject({ estado: 'ok', mime: 'application/pdf', nombre: '2026-10-06 14.07.00 Presupuesto.pdf' })
    // Cargarlo de nuevo no duplica nada.
    const otra = await importarRespaldo(archivo, { nombreArchivo: 'r.zip' })
    expect(otra.mensajes).toBe(0)
    expect(a.listarMensajes(JID)).toHaveLength(4)
  })

  it('la exportación del celular: el chat sale del nombre del archivo y los propios son el otro autor', async () => {
    const JID = '5493564333333@s.whatsapp.net'
    a.upsertChat(JID, { pushName: 'Carla Gómez', ultimoTs: 1 })
    const archivo = zip([{ nombre: 'Chat de WhatsApp con Carla Gómez.txt', datos: [linea(hace(8), 'Carla Gómez', '¿Sigue disponible?'), linea(hace(7), 'Neifert Automotores', 'Sí, pasá cuando quieras')].join('\n') }])
    const r = await importarRespaldo(archivo, { nombreArchivo: 'Chat de WhatsApp con Carla Gómez.zip' })
    expect(r.mensajes).toBe(2)
    expect(a.listarMensajes(JID).map((m) => m.deMi)).toEqual([false, true])
  })

  it('un chat que no estaba guardado queda con el nombre del respaldo', async () => {
    const JID = '5493564444444@s.whatsapp.net'
    const archivo = zip([{ nombre: '5493564444444 - Pedro/Chat de WhatsApp.txt', datos: ['Chat de WhatsApp con Pedro (+5493564444444)', '', linea(hace(3), 'Pedro', 'Buenas')].join('\n') }])
    await importarRespaldo(archivo, { nombreArchivo: 'r.zip' })
    expect(a.nombreDe(JID)).toBe('Pedro')
  })
})
