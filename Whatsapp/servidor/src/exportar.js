/*
 * Exportar chats a texto, con el mismo formato que "Exportar chat" del celular:
 *   06/10/2026, 14:05 - Neifert (Bruno): Hola, ¿cómo estás?
 * Solo texto: un chat suelto sale como .txt; todos juntos, en un .zip con un .txt por chat.
 * Con los archivos: un .zip con una carpeta por chat (el número y el nombre), y adentro el
 * chat.txt y las fotos, audios, videos, stickers y documentos que estén descargados. En el
 * texto, cada uno dice qué archivo es, como en la exportación del celular.
 */
import zlib from 'node:zlib'

const dos = (n) => String(n).padStart(2, '0')
const fecha = (ts) => {
  const d = new Date(ts * 1000)
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}, ${dos(d.getHours())}:${dos(d.getMinutes())}`
}

const ARCHIVO = {
  imagen: 'Foto', video: 'Video', gif: 'GIF', nota_voz: 'Nota de voz', audio: 'Audio', documento: 'Documento',
  sticker: 'Sticker', ubicacion: 'Ubicación', contacto: 'Contacto', producto: 'Producto', una_vez: 'Para ver una vez',
}

/** Quién escribió: la línea (con el empleado que lo mandó), el contacto o el integrante del grupo. */
function autor(m, chat) {
  if (m.deMi) return m.enviadoPor?.nombre ? `Neifert (${m.enviadoPor.nombre})` : 'Neifert'
  if (chat.esGrupo) return m.autorNombre || 'Integrante'
  return chat.nombre || chat.telefono || 'Contacto'
}

function cuerpo(m, adjuntos) {
  const tipo = ARCHIVO[m.tipo]
  let texto = m.texto || ''
  if (tipo) {
    const adjunto = adjuntos?.get(m.id)
    const nombre = adjunto ? `: ${adjunto} (archivo adjunto)` : m.tipo === 'documento' && m.media?.nombre ? `: ${m.media.nombre}` : ''
    texto = `<${tipo}${nombre}>${texto ? ` ${texto}` : ''}`
  }
  if (m.eliminado) texto = `<Eliminado>${texto ? ` ${texto}` : ''}`
  if (m.editado) texto += ' <Editado>'
  return texto
}

/**
 * Un chat entero como texto. `chat` es la vista del chat (nombre, teléfono, esGrupo).
 * `adjuntos` (id del mensaje → nombre del archivo en la carpeta), cuando van los archivos.
 */
export function textoDeChat(chat, mensajes, adjuntos = null) {
  const encabezado = [
    `Chat de WhatsApp con ${chat.nombre}${chat.telefono && chat.telefono !== chat.nombre ? ` (${chat.telefono})` : ''}`,
    `Exportado el ${fecha(Date.now() / 1000)} · ${mensajes.length} mensajes`,
    '',
  ]
  const lineas = mensajes
    .filter((m) => m.tipo !== 'sistema' || m.texto)
    .map((m) => `${fecha(m.ts)} - ${autor(m, chat)}: ${cuerpo(m, adjuntos)}`)
  return `${[...encabezado, ...lineas].join('\n')}\n`
}

/** Carpeta de cada chat: el número primero (así quedan ordenadas por número) y el nombre. */
export function carpetaDeChat(chat) {
  const numero = String(chat.telefono || '').replace(/\D/g, '')
  // Sin punto ni espacio al final: Windows no deja crear esa carpeta.
  const carpeta = (texto) => nombreArchivo(texto, '').slice(0, -1).replace(/[. ]+$/, '') || 'chat'
  if (chat.esGrupo) return carpeta(`Grupo - ${chat.nombre || 'sin nombre'}`)
  const nombre = chat.nombre && String(chat.nombre).replace(/\D/g, '') !== numero ? chat.nombre : ''
  return carpeta([numero, nombre].filter(Boolean).join(' - ') || chat.id?.split('@')[0])
}

// "2026-10-06 14.05.33" (con puntos: Windows no acepta ":" en los nombres).
const sello = (ts) => {
  const d = new Date(ts * 1000)
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}.${dos(d.getMinutes())}.${dos(d.getSeconds())}`
}

/** Nombre del archivo de un mensaje dentro de la carpeta: fecha, qué es y su extensión. */
export function nombreAdjunto(m) {
  const ext = (String(m.media?.archivo || '').match(/\.([a-z0-9]{1,8})$/i)?.[1] || 'bin').toLowerCase()
  if (m.tipo === 'documento' && m.media?.nombre) {
    const limpio = nombreArchivo(m.media.nombre, 'x').slice(0, -2)
    return `${sello(m.ts)} ${/\.[a-z0-9]{1,8}$/i.test(limpio) ? limpio : `${limpio}.${ext}`}`
  }
  return `${sello(m.ts)} ${ARCHIVO[m.tipo] || 'Archivo'}.${ext}`
}

/**
 * Escribe en `zip` (ver zipEnVivo) la carpeta de cada chat con su texto y sus archivos.
 * `leerMedia(chatId, mensaje)` devuelve el archivo (Buffer) o null si no está.
 * Devuelve cuántos archivos fueron y cuántos no se encontraron.
 */
export async function exportarConArchivos(zip, chats, { mensajesDe, leerMedia }) {
  let archivos = 0
  let faltan = 0
  for (const chat of chats) {
    const carpeta = carpetaDeChat(chat)
    const mensajes = mensajesDe(chat.id)
    const adjuntos = new Map()
    for (const m of mensajes) {
      if (m.eliminado && !m.media) continue
      if (m.media?.estado !== 'ok' || !m.media.archivo) continue
      const datos = await Promise.resolve()
        .then(() => leerMedia(chat.id, m))
        .catch(() => null)
      if (!datos) {
        faltan++
        continue
      }
      const nombre = nombreAdjunto(m)
      await zip.agregar(`${carpeta}/${nombre}`, datos, { comprimir: false, fecha: new Date(m.ts * 1000) })
      adjuntos.set(m.id, nombre)
      archivos++
    }
    await zip.agregar(`${carpeta}/Chat de WhatsApp.txt`, textoDeChat(chat, mensajes, adjuntos))
  }
  return { archivos, faltan }
}

/** Nombre de archivo válido en Windows, Mac y celulares. */
export function nombreArchivo(texto, extension) {
  const limpio = String(texto || 'chat').replace(/[\\/:*?"<>|\p{Cc}]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return `${limpio || 'chat'}.${extension}`
}

/*
 * .zip armado de a un archivo por vez: cada uno sale apenas se agrega (no hace falta tener
 * todo en memoria, y con fotos y videos el total puede pasar varios GB). Comprimido con
 * deflate solo el texto (fotos, audios y videos ya vienen comprimidos), nombres en UTF-8
 * (para los tildes) y con ZIP64 si pasa los 4 GB o los 65.535 archivos: lo abre el
 * Explorador de Windows sin programas extra.
 */
const MAX32 = 0xffffffff
const horaDos = (d) => (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
const fechaDos = (d) => ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()

export class ArmadoZip {
  constructor() {
    this.central = []
    this.desplazamiento = 0
    this.usados = new Set()
  }

  /** Devuelve los trozos a escribir para `nombre` (puede llevar carpetas: "Juan/chat.txt"). */
  entrada(nombre, datos, { comprimir = true, fecha = new Date() } = {}) {
    // Dos archivos con el mismo nombre: "Juan.txt" y "Juan (2).txt".
    let final = nombre
    for (let i = 2; this.usados.has(final.toLowerCase()); i++) final = nombre.replace(/(\.[^./]+)?$/, ` (${i})$1`)
    this.usados.add(final.toLowerCase())

    const buf = Buffer.isBuffer(datos) ? datos : Buffer.from(datos, 'utf8')
    const guardado = comprimir ? zlib.deflateRawSync(buf) : buf
    const metodo = comprimir ? 8 : 0
    const nombreBuf = Buffer.from(final, 'utf8')
    const crc = zlib.crc32(buf)
    const hora = horaDos(fecha)
    const dia = fechaDos(fecha)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // versión necesaria
    local.writeUInt16LE(0x0800, 6) // nombre en UTF-8
    local.writeUInt16LE(metodo, 8)
    local.writeUInt16LE(hora, 10)
    local.writeUInt16LE(dia, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(guardado.length, 18)
    local.writeUInt32LE(buf.length, 22)
    local.writeUInt16LE(nombreBuf.length, 26)
    local.writeUInt16LE(0, 28)

    // Pasados los 4 GB, dónde empieza el archivo va aparte (campo extra ZIP64).
    const grande = this.desplazamiento >= MAX32
    const extra = grande ? Buffer.alloc(12) : Buffer.alloc(0)
    if (grande) {
      extra.writeUInt16LE(0x0001, 0)
      extra.writeUInt16LE(8, 2)
      extra.writeBigUInt64LE(BigInt(this.desplazamiento), 4)
    }
    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(grande ? 45 : 20, 4) // hecho por
    dir.writeUInt16LE(grande ? 45 : 20, 6)
    dir.writeUInt16LE(0x0800, 8)
    dir.writeUInt16LE(metodo, 10)
    dir.writeUInt16LE(hora, 12)
    dir.writeUInt16LE(dia, 14)
    dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(guardado.length, 20)
    dir.writeUInt32LE(buf.length, 24)
    dir.writeUInt16LE(nombreBuf.length, 28)
    dir.writeUInt16LE(extra.length, 30)
    dir.writeUInt32LE(grande ? MAX32 : this.desplazamiento, 42)

    this.central.push(dir, nombreBuf, extra)
    this.desplazamiento += local.length + nombreBuf.length + guardado.length
    return [local, nombreBuf, guardado]
  }

  /** El índice del final (directorio central). */
  fin() {
    const cantidad = this.central.length / 3
    const tamCentral = this.central.reduce((s, b) => s + b.length, 0)
    const inicioCentral = this.desplazamiento
    const partes = [...this.central]
    const zip64 = cantidad >= 0xffff || inicioCentral >= MAX32 || tamCentral >= MAX32
    if (zip64) {
      const registro = Buffer.alloc(56)
      registro.writeUInt32LE(0x06064b50, 0)
      registro.writeBigUInt64LE(44n, 4)
      registro.writeUInt16LE(45, 12)
      registro.writeUInt16LE(45, 14)
      registro.writeBigUInt64LE(BigInt(cantidad), 24)
      registro.writeBigUInt64LE(BigInt(cantidad), 32)
      registro.writeBigUInt64LE(BigInt(tamCentral), 40)
      registro.writeBigUInt64LE(BigInt(inicioCentral), 48)
      const localizador = Buffer.alloc(20)
      localizador.writeUInt32LE(0x07064b50, 0)
      localizador.writeBigUInt64LE(BigInt(inicioCentral + tamCentral), 8)
      localizador.writeUInt32LE(1, 16)
      partes.push(registro, localizador)
    }
    const fin = Buffer.alloc(22)
    fin.writeUInt32LE(0x06054b50, 0)
    fin.writeUInt16LE(Math.min(cantidad, 0xffff), 8)
    fin.writeUInt16LE(Math.min(cantidad, 0xffff), 10)
    fin.writeUInt32LE(Math.min(tamCentral, MAX32), 12)
    fin.writeUInt32LE(Math.min(inicioCentral, MAX32), 16)
    partes.push(fin)
    return partes
  }
}

/** Un .zip entero en memoria con `archivos` ([{ nombre, datos }]): para los que son solo texto. */
export function crearZip(archivos) {
  const zip = new ArmadoZip()
  const partes = archivos.flatMap(({ nombre, datos }) => zip.entrada(nombre, datos))
  return Buffer.concat([...partes, ...zip.fin()])
}

/** Escribe el .zip en `destino` (la respuesta HTTP) a medida que se agregan los archivos. */
export function zipEnVivo(destino) {
  const zip = new ArmadoZip()
  const escribir = async (partes) => {
    for (const p of partes) {
      if (destino.destroyed) throw new Error('Se canceló la descarga')
      if (!destino.write(p)) await new Promise((r) => destino.once('drain', r))
    }
  }
  return {
    agregar: (nombre, datos, opciones) => escribir(zip.entrada(nombre, datos, opciones)),
    terminar: async () => {
      await escribir(zip.fin())
      destino.end()
    },
  }
}
