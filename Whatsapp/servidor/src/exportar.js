/*
 * Exportar chats a texto, con el mismo formato que "Exportar chat" del celular:
 *   06/10/2026, 14:05 - Neifert (Bruno): Hola, ¿cómo estás?
 * Un chat suelto sale como .txt; todos juntos, en un .zip con un .txt por chat.
 * Los archivos (fotos, audios, documentos) no van adentro: queda la línea que dice cuál era.
 */
import zlib from 'node:zlib'

const dos = (n) => String(n).padStart(2, '0')
const fecha = (ts) => {
  const d = new Date(ts * 1000)
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}, ${dos(d.getHours())}:${dos(d.getMinutes())}`
}

const ARCHIVO = {
  imagen: 'Foto', video: 'Video', gif: 'GIF', nota_voz: 'Nota de voz', audio: 'Audio', documento: 'Documento',
  sticker: 'Sticker', ubicacion: 'Ubicación', contacto: 'Contacto', una_vez: 'Para ver una vez',
}

/** Quién escribió: la línea (con el empleado que lo mandó), el contacto o el integrante del grupo. */
function autor(m, chat) {
  if (m.deMi) return m.enviadoPor?.nombre ? `Neifert (${m.enviadoPor.nombre})` : 'Neifert'
  if (chat.esGrupo) return m.autorNombre || 'Integrante'
  return chat.nombre || chat.telefono || 'Contacto'
}

function cuerpo(m) {
  const tipo = ARCHIVO[m.tipo]
  let texto = m.texto || ''
  if (tipo) {
    const nombre = m.tipo === 'documento' && m.media?.nombre ? `: ${m.media.nombre}` : ''
    texto = `<${tipo}${nombre}>${texto ? ` ${texto}` : ''}`
  }
  if (m.eliminado) texto = `<Eliminado>${texto ? ` ${texto}` : ''}`
  if (m.editado) texto += ' <Editado>'
  return texto
}

/** Un chat entero como texto. `chat` es la vista del chat (nombre, teléfono, esGrupo). */
export function textoDeChat(chat, mensajes) {
  const encabezado = [
    `Chat de WhatsApp con ${chat.nombre}${chat.telefono && chat.telefono !== chat.nombre ? ` (${chat.telefono})` : ''}`,
    `Exportado el ${fecha(Date.now() / 1000)} · ${mensajes.length} mensajes`,
    '',
  ]
  const lineas = mensajes
    .filter((m) => m.tipo !== 'sistema' || m.texto)
    .map((m) => `${fecha(m.ts)} - ${autor(m, chat)}: ${cuerpo(m)}`)
  return `${[...encabezado, ...lineas].join('\n')}\n`
}

/** Nombre de archivo válido en Windows, Mac y celulares. */
export function nombreArchivo(texto, extension) {
  const limpio = String(texto || 'chat').replace(/[\\/:*?"<>|\p{Cc}]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return `${limpio || 'chat'}.${extension}`
}

/**
 * Arma un .zip con `archivos` ([{ nombre, datos }]). Comprimido con deflate, nombres en
 * UTF-8 (para los tildes): lo abre el Explorador de Windows sin programas extra.
 */
export function crearZip(archivos) {
  const partes = []
  const central = []
  let desplazamiento = 0
  const usados = new Set()
  const ahora = new Date()
  const horaDos = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1)
  const fechaDos = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate()

  for (const { nombre, datos } of archivos) {
    // Dos chats con el mismo nombre: "Juan.txt" y "Juan (2).txt".
    let final = nombre
    for (let i = 2; usados.has(final.toLowerCase()); i++) final = nombre.replace(/(\.[^.]+)?$/, ` (${i})$1`)
    usados.add(final.toLowerCase())

    const buf = Buffer.isBuffer(datos) ? datos : Buffer.from(datos, 'utf8')
    const comprimido = zlib.deflateRawSync(buf)
    const nombreBuf = Buffer.from(final, 'utf8')
    const crc = zlib.crc32(buf)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // versión necesaria
    local.writeUInt16LE(0x0800, 6) // nombre en UTF-8
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(horaDos, 10)
    local.writeUInt16LE(fechaDos, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(comprimido.length, 18)
    local.writeUInt32LE(buf.length, 22)
    local.writeUInt16LE(nombreBuf.length, 26)
    local.writeUInt16LE(0, 28)

    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(20, 4) // hecho por
    dir.writeUInt16LE(20, 6)
    dir.writeUInt16LE(0x0800, 8)
    dir.writeUInt16LE(8, 10)
    dir.writeUInt16LE(horaDos, 12)
    dir.writeUInt16LE(fechaDos, 14)
    dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(comprimido.length, 20)
    dir.writeUInt32LE(buf.length, 24)
    dir.writeUInt16LE(nombreBuf.length, 28)
    dir.writeUInt32LE(desplazamiento, 42)

    partes.push(local, nombreBuf, comprimido)
    central.push(dir, nombreBuf)
    desplazamiento += local.length + nombreBuf.length + comprimido.length
  }

  const tamCentral = central.reduce((s, b) => s + b.length, 0)
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0)
  fin.writeUInt16LE(archivos.length, 8)
  fin.writeUInt16LE(archivos.length, 10)
  fin.writeUInt32LE(tamCentral, 12)
  fin.writeUInt32LE(desplazamiento, 16)
  return Buffer.concat([...partes, ...central, fin])
}
