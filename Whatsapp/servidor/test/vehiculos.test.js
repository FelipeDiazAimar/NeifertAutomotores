import './entorno.js'
import { spawnSync } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

process.env.CRM_URL = 'https://neifert.test/crm/whatsapp'
const a = await import('../src/almacen.js')
const { vehiculoPublicado, vehiculosPublicados } = await import('../src/crm.js')
const { enviarVehiculo, textoVehiculo } = await import('../src/whatsapp.js')
const { aJpeg } = await import('../src/audio.js')

// crm.vehiculos de mentira, como lo devuelve la API REST del CRM.
const FILA = {
  id: 'v1',
  marca: 'Chevrolet',
  modelo: 'Tracker',
  version: 'LT 1.2T',
  anio: 2022,
  km: 35000,
  moneda: 'USD',
  precio_contado: 25000,
  combustible: 'Nafta',
  transmision: 'Automática',
  es_0km: false,
  estado: 'reservado',
  vehiculo_fotos: [
    { url: 'https://fotos.test/2.webp', es_portada: false, orden: 2 },
    { url: 'https://fotos.test/1.webp', es_portada: true, orden: 1 },
  ],
}
const pedidos = []

beforeAll(() => {
  vi.stubGlobal('fetch', async (url) => {
    pedidos.push(decodeURIComponent(String(url)))
    const u = new URL(url)
    const filas = u.searchParams.get('id') === 'eq.v1' || !u.searchParams.get('id') ? [FILA] : []
    return new Response(JSON.stringify(filas), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
})
afterAll(() => vi.unstubAllGlobals())

describe('vehículos de la página para mandar al chat', () => {
  it('trae solo los publicados que no están vendidos, con la foto de portada', async () => {
    const [v] = await vehiculosPublicados()
    expect(pedidos.at(-1)).toMatch(/publicado=eq\.true&estado=in\.\(disponible,reservado\)/)
    expect(pedidos.at(-1)).not.toMatch(/patente|dueno|nota/)
    expect(v).toMatchObject({ id: 'v1', marca: 'Chevrolet', precio: 25000, moneda: 'USD', reservado: true, ceroKm: false, foto: 'https://fotos.test/1.webp' })
  })

  it('uno que ya no está publicado no se manda', async () => {
    await expect(vehiculoPublicado('otro')).rejects.toThrow(/ya no está publicado/)
  })

  it('el texto de la card lleva nombre, datos, precio y el enlace a la ficha', async () => {
    const v = await vehiculoPublicado('v1')
    const texto = textoVehiculo(v, 'https://neifert.test/catalogo/v1')
    const [titulo, datos, precio, estado, enlace] = texto.split('\n')
    expect(titulo).toBe('*Chevrolet Tracker LT 1.2T*')
    expect(datos).toBe('2022 · 35.000 km · Nafta · Automática')
    expect(precio).toMatch(/US\$\s?25\.000/)
    expect(estado).toBe('Reservado')
    expect(enlace).toBe('https://neifert.test/catalogo/v1')
    expect(textoVehiculo({ marca: 'Fiat', modelo: 'Cronos', precio: null }, 'x')).toBe('*Fiat Cronos*\nPrecio a consultar\nx')
  })

  it('sin foto ni conexión, el texto queda en la bandeja de salida con el enlace del 0 km', async () => {
    const CHAT = '5493564222222@s.whatsapp.net'
    a.upsertChat(CHAT, { ultimoTs: 1 })
    const r = await enviarVehiculo(CHAT, { id: 'v9', marca: 'Fiat', modelo: 'Cronos', ceroKm: true, precio: null, foto: null })
    expect(r.enCola).toBe(true)
    expect(a.listarMensajes(CHAT).map((m) => m.texto)).toContain('*Fiat Cronos*\nPrecio a consultar\nhttps://neifert.test/catalogo-0km/v9')
  })

  it('las fotos webp de la página salen en JPEG', async () => {
    const webp = spawnSync(ffmpegPath, ['-f', 'lavfi', '-i', 'color=c=blue:s=64x48', '-frames:v', '1', '-c:v', 'libwebp', '-f', 'webp', 'pipe:1'], { maxBuffer: 1e7 }).stdout
    expect(webp.toString('latin1', 8, 12)).toBe('WEBP')
    const jpeg = await aJpeg(webp)
    expect([jpeg[0], jpeg[1]]).toEqual([0xff, 0xd8])
  })
})
