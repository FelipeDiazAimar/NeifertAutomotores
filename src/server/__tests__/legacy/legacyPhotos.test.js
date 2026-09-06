import { describe, it, expect, vi } from 'vitest'

const { putR2Object } = vi.hoisted(() => ({ putR2Object: vi.fn() }))
vi.mock('../../r2Core.js', () => ({
  putR2Object: (...a) => putR2Object(...a),
  createR2Client: () => ({}),
}))

const { r2KeyForPhoto, syncFotosVehiculo } = await import('../../legacyPhotos.js')

function okImg() {
  return {
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'image/jpeg']]),
    arrayBuffer: async () => new ArrayBuffer(8),
  }
}

describe('r2KeyForPhoto', () => {
  it('namespaces by vehicle and keeps extension', () => {
    const k = r2KeyForPhoto('v1', 'https://x/y/pic.png?foo=1')
    expect(k).toMatch(/^legacy\/vehiculos\/v1\/[a-f0-9]{12}\.png$/)
  })
})

describe('syncFotosVehiculo', () => {
  it('downloads only new urls, keeps mirrored ones', async () => {
    putR2Object.mockResolvedValue(undefined)
    const fetchImpl = vi.fn().mockResolvedValue(okImg())
    const res = await syncFotosVehiculo({
      vehiculoId: 'v1',
      urls: ['https://x/a.jpg', 'https://x/b.jpg'],
      existentes: [{ url_origen: 'https://x/a.jpg', url_espejo: 'https://pub/legacy/vehiculos/v1/aaa.jpg' }],
      r2: {}, bucket: 'b', publicUrlBase: 'https://pub', fetchImpl,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(res.bajadas).toBe(1)
    expect(res.filas).toHaveLength(2)
    expect(res.filas.find((f) => f.url_origen === 'https://x/b.jpg').url_espejo).toContain('https://pub/legacy/vehiculos/v1/')
  })

  it('records an error row when download fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    const res = await syncFotosVehiculo({
      vehiculoId: 'v1', urls: ['https://x/c.jpg'], existentes: [],
      r2: {}, bucket: 'b', publicUrlBase: 'https://pub', fetchImpl,
    })
    expect(res.errores).toBe(1)
    expect(res.filas[0].url_espejo).toBe(null)
  })
})
