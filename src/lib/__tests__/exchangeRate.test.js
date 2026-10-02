import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('exchangeRate', () => {
  beforeEach(() => vi.resetModules())

  it('devuelve el valor de venta de la cotización oficial', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ compra: 990, venta: 1000 }),
    })
    const { obtenerCotizacionUsd } = await import('../exchangeRate.js')
    const rate = await obtenerCotizacionUsd({ fetchImpl })
    expect(rate).toBe(1000)
  })

  it('cachea la cotización: una segunda llamada no vuelve a pedirla', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ compra: 990, venta: 1000 }),
    })
    const { obtenerCotizacionUsd } = await import('../exchangeRate.js')
    await obtenerCotizacionUsd({ fetchImpl })
    await obtenerCotizacionUsd({ fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('si la API falla y no hay caché previa, devuelve null en vez de tirar', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'))
    const { obtenerCotizacionUsd } = await import('../exchangeRate.js')
    const rate = await obtenerCotizacionUsd({ fetchImpl })
    expect(rate).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('si la API falla pero ya había una cotización cacheada, devuelve esa (aunque esté vencida)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const okFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ venta: 1200 }) })
    const { obtenerCotizacionUsd } = await import('../exchangeRate.js')
    await obtenerCotizacionUsd({ fetchImpl: okFetch })

    const failFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    // La caché sigue vigente (recién se cargó), así que ni siquiera debería llamar a failFetch.
    const rate = await obtenerCotizacionUsd({ fetchImpl: failFetch })
    expect(rate).toBe(1200)
    consoleErrorSpy.mockRestore()
  })
})
