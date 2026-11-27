/*
 * Cifrado en flujo, para el respaldo LOCAL (el que se baja con "Exportar todos los chats"): lleva
 * todos los chats con todos sus archivos, así que puede pesar varios GB y no se puede cifrar de una
 * (respaldo.js cifra el paquete entero en memoria; esto lo hace de a trozos).
 *
 * Mismo cifrado que el de la nube: AES-256-GCM con una llave sacada de WA_BACKUP_CLAVE con scrypt.
 *
 * Formato:
 *   "NFWB2\n" · sal (16) · prefijo del nonce (4)
 *   y después, una y otra vez, un trozo: marca (1: 1 si es el último) · largo (4) · cifrado · etiqueta (16).
 * Cada trozo se autentica con su número y su marca: si falta uno, sobra uno, están cambiados de lugar
 * o se cortó el archivo antes del último trozo, no se puede descifrar. Con otra clave tampoco.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const MAGIA_FLUJO = Buffer.from('NFWB2\n')
export const TROZO = 1024 * 1024
const ETIQUETA = 16
const ENCABEZADO = MAGIA_FLUJO.length + 16 + 4

const nonceDe = (prefijo, numero) => {
  const n = Buffer.alloc(12)
  prefijo.copy(n, 0)
  n.writeBigUInt64BE(BigInt(numero), 4)
  return n
}
const adicional = (marca, numero) => {
  const a = Buffer.alloc(9)
  a.writeUInt8(marca, 0)
  a.writeBigUInt64BE(BigInt(numero), 1)
  return a
}

/** Transform que cifra todo lo que le pasan. */
export function crearCifrador(clave) {
  const sal = crypto.randomBytes(16)
  const prefijo = crypto.randomBytes(4)
  const llave = crypto.scryptSync(clave, sal, 32)
  let pendiente = Buffer.alloc(0)
  let numero = 0
  let encabezadoEnviado = false

  const trozo = (datos, ultimo) => {
    const c = crypto.createCipheriv('aes-256-gcm', llave, nonceDe(prefijo, numero))
    c.setAAD(adicional(ultimo ? 1 : 0, numero))
    const cifrado = Buffer.concat([c.update(datos), c.final()])
    const cabecera = Buffer.alloc(5)
    cabecera.writeUInt8(ultimo ? 1 : 0, 0)
    cabecera.writeUInt32BE(cifrado.length, 1)
    numero++
    return Buffer.concat([cabecera, cifrado, c.getAuthTag()])
  }
  const encabezado = () => {
    if (encabezadoEnviado) return Buffer.alloc(0)
    encabezadoEnviado = true
    return Buffer.concat([MAGIA_FLUJO, sal, prefijo])
  }

  return new Transform({
    transform(datos, _enc, cb) {
      try {
        pendiente = pendiente.length ? Buffer.concat([pendiente, datos]) : datos
        const salida = [encabezado()]
        // Siempre queda algo para el último trozo: se manda un trozo solo si hay más de uno entero.
        while (pendiente.length > TROZO) {
          salida.push(trozo(pendiente.subarray(0, TROZO), false))
          pendiente = pendiente.subarray(TROZO)
        }
        cb(null, Buffer.concat(salida))
      } catch (err) {
        cb(err)
      }
    },
    flush(cb) {
      try {
        cb(null, Buffer.concat([encabezado(), trozo(pendiente, true)]))
      } catch (err) {
        cb(err)
      }
    },
  })
}

const ERROR_CLAVE = 'La clave no es la correcta (o el respaldo está dañado)'

/** Transform que descifra lo que hizo crearCifrador. Tira error si la clave no es o el archivo está cortado o dañado. */
export function crearDescifrador(clave) {
  let buffer = Buffer.alloc(0)
  let llave = null
  let prefijo = null
  let numero = 0
  let terminado = false

  const sacarTrozos = (empujar) => {
    for (;;) {
      if (!llave) {
        if (buffer.length < ENCABEZADO) return
        if (!buffer.subarray(0, MAGIA_FLUJO.length).equals(MAGIA_FLUJO)) throw new Error('No es un respaldo de WhatsApp Neifert')
        llave = crypto.scryptSync(clave, buffer.subarray(MAGIA_FLUJO.length, MAGIA_FLUJO.length + 16), 32)
        prefijo = buffer.subarray(MAGIA_FLUJO.length + 16, ENCABEZADO)
        buffer = buffer.subarray(ENCABEZADO)
      }
      if (buffer.length < 5) return
      const marca = buffer.readUInt8(0)
      const largo = buffer.readUInt32BE(1)
      if (marca > 1 || largo > TROZO) throw new Error('El respaldo está dañado')
      if (buffer.length < 5 + largo + ETIQUETA) return
      if (terminado) throw new Error('El respaldo está dañado (sobran datos al final)')
      const d = crypto.createDecipheriv('aes-256-gcm', llave, nonceDe(prefijo, numero))
      d.setAAD(adicional(marca, numero))
      d.setAuthTag(buffer.subarray(5 + largo, 5 + largo + ETIQUETA))
      let claro
      try {
        claro = Buffer.concat([d.update(buffer.subarray(5, 5 + largo)), d.final()])
      } catch {
        throw new Error(ERROR_CLAVE)
      }
      buffer = buffer.subarray(5 + largo + ETIQUETA)
      numero++
      if (marca === 1) terminado = true
      if (claro.length) empujar(claro)
    }
  }

  return new Transform({
    transform(datos, _enc, cb) {
      try {
        buffer = buffer.length ? Buffer.concat([buffer, datos]) : datos
        sacarTrozos((c) => this.push(c))
        cb()
      } catch (err) {
        cb(err)
      }
    },
    flush(cb) {
      if (!terminado || buffer.length) return cb(new Error('El respaldo está incompleto o dañado (se cortó antes del final)'))
      cb()
    },
  })
}

/** ¿El archivo es un respaldo local cifrado? Mira cómo empieza. */
export function esRespaldoCifrado(archivo) {
  const fd = fs.openSync(archivo, 'r')
  try {
    const inicio = Buffer.alloc(MAGIA_FLUJO.length)
    fs.readSync(fd, inicio, 0, inicio.length, 0)
    return inicio.equals(MAGIA_FLUJO)
  } finally {
    fs.closeSync(fd)
  }
}

/** Descifra `origen` en `destino` (un .zip), de a trozos. Si falla, no deja el archivo a medias. */
export async function descifrarArchivo(origen, destino, clave) {
  try {
    await pipeline(fs.createReadStream(origen), crearDescifrador(clave), fs.createWriteStream(destino))
  } catch (err) {
    fs.rmSync(destino, { force: true })
    throw err
  }
}
