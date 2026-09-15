import { describe, it, expect, vi, beforeEach } from 'vitest'

const selectMock = vi.fn()
vi.mock('@/services/supabaseClient', () => ({
  supabase: { schema: () => ({ from: () => ({ select: selectMock }) }) },
}))

const obtenerCotizacionUsd = vi.fn()
vi.mock('@/lib/exchangeRate', () => ({ obtenerCotizacionUsd: (...args) => obtenerCotizacionUsd(...args) }))

import { listarPublicos, obtenerPublicoPorId } from '../services/vehiculosPublico.service'

// Los query builders de supabase-js son "thenables" (resuelven al awaitearlos
// sin necesariamente llamar a un método terminal como .order()) — el mock
// necesita imitar eso para los sorts de precio, que ya no llaman a .order().
function chain(finalResult) {
  const c = {
    eq: vi.fn(() => c),
    or: vi.fn(() => c),
    in: vi.fn(() => c),
    gte: vi.fn(() => c),
    lte: vi.fn(() => c),
    order: vi.fn(() => Promise.resolve(finalResult)),
    maybeSingle: vi.fn(() => Promise.resolve(finalResult)),
    then: (resolve, reject) => Promise.resolve(finalResult).then(resolve, reject),
  }
  return c
}

beforeEach(() => {
  obtenerCotizacionUsd.mockReset().mockResolvedValue(1000) // 1000 ARS = 1 USD
})

describe('vehiculosPublico.service', () => {
  it('listarPublicos selecciona solo columnas públicas, nunca privadas ni precio_usd (ya no existe)', async () => {
    selectMock.mockReturnValue(chain({ data: [], error: null }))
    await listarPublicos()
    const columnasSeleccionadas = selectMock.mock.calls[0][0]
    for (const privada of ['duenio_nombre', 'itv', 'patente', 'nota', 'consignacion', 'precio_usd']) {
      expect(columnasSeleccionadas).not.toContain(privada)
    }
    expect(columnasSeleccionadas).toContain('precio_contado')
  })

  it('listarPublicos mapea filas de crm.vehiculos al shape en inglés que usa la UI', async () => {
    const fila = {
      id: 'v1', marca: 'Ford', modelo: 'Fiesta', version: 'S', color: 'Rojo', anio: 2020,
      moneda: 'USD', precio_contado: 15000, km: 40000, combustible: 'Nafta',
      transmision: 'Manual', categoria: 'sedan', es_nuevo: false, descripcion: 'Buen estado',
      estado: 'disponible', creado_en: '2026-01-01',
      vehiculo_fotos: [
        { url: 'https://x/2.jpg', es_portada: false, orden: 1 },
        { url: 'https://x/1.jpg', es_portada: true, orden: 0 },
      ],
    }
    selectMock.mockReturnValue(chain({ data: [fila], error: null }))
    const [v] = await listarPublicos()
    expect(v).toMatchObject({
      id: 'v1', brand: 'Ford', model: 'Fiesta', year: 2020, price_amount: 15000, currency: 'USD',
      price_usd: 15000, // ya está en USD, no se convierte
      fuel_type: 'Nafta', transmission: 'Manual', category: 'sedan', is_new: false,
      main_image_url: 'https://x/1.jpg', images: ['https://x/1.jpg', 'https://x/2.jpg'],
    })
  })

  it('un vehículo en ARS muestra su precio en ARS, pero se compara internamente en USD', async () => {
    const fila = {
      id: 'v1', marca: 'Fiat', modelo: 'Cronos', moneda: 'ARS', precio_contado: 21000000,
      estado: 'disponible', vehiculo_fotos: [],
    }
    selectMock.mockReturnValue(chain({ data: [fila], error: null }))
    const [v] = await listarPublicos()
    expect(v.currency).toBe('ARS')
    expect(v.price_amount).toBe(21000000) // se muestra tal cual, en pesos
    expect(v.price_usd).toBe(21000) // 21.000.000 / 1000 = 21.000 USD, solo para ordenar/comparar
  })

  it('ordena vehículos en ARS y en USD juntos por su equivalente en USD, sin llamar a .order() en la base', async () => {
    const filas = [
      { id: 'caro-ars', marca: 'A', modelo: 'A', moneda: 'ARS', precio_contado: 30000000, estado: 'disponible', vehiculo_fotos: [] }, // 30.000 USD
      { id: 'barato-usd', marca: 'B', modelo: 'B', moneda: 'USD', precio_contado: 5000, estado: 'disponible', vehiculo_fotos: [] }, // 5.000 USD
      { id: 'medio-ars', marca: 'C', modelo: 'C', moneda: 'ARS', precio_contado: 15000000, estado: 'disponible', vehiculo_fotos: [] }, // 15.000 USD
    ]
    const c = chain({ data: filas, error: null })
    selectMock.mockReturnValue(c)

    const asc = await listarPublicos({ sort: 'price-asc' })
    expect(asc.map((v) => v.id)).toEqual(['barato-usd', 'medio-ars', 'caro-ars'])
    expect(c.order).not.toHaveBeenCalled()

    const desc = await listarPublicos({ sort: 'price-desc' })
    expect(desc.map((v) => v.id)).toEqual(['caro-ars', 'medio-ars', 'barato-usd'])
  })

  it('si no hay cotización disponible, los vehículos sin precio_usd quedan al final (no rompe el orden)', async () => {
    obtenerCotizacionUsd.mockResolvedValue(null)
    const filas = [
      { id: 'usd', marca: 'A', modelo: 'A', moneda: 'USD', precio_contado: 5000, estado: 'disponible', vehiculo_fotos: [] },
      { id: 'ars-sin-convertir', marca: 'B', modelo: 'B', moneda: 'ARS', precio_contado: 10000000, estado: 'disponible', vehiculo_fotos: [] },
    ]
    selectMock.mockReturnValue(chain({ data: filas, error: null }))
    const asc = await listarPublicos({ sort: 'price-asc' })
    expect(asc.map((v) => v.id)).toEqual(['usd', 'ars-sin-convertir'])
  })

  it('year-desc y km-asc siguen ordenando en la base (no necesitan conversión de moneda)', async () => {
    const c = chain({ data: [], error: null })
    selectMock.mockReturnValue(c)
    await listarPublicos({ sort: 'year-desc' })
    expect(c.order).toHaveBeenCalledWith('anio', { ascending: false })

    await listarPublicos({ sort: 'km-asc' })
    expect(c.order).toHaveBeenCalledWith('km', { ascending: true })
  })

  it('obtenerPublicoPorId devuelve null si no hay match', async () => {
    selectMock.mockReturnValue(chain({ data: null, error: null }))
    const v = await obtenerPublicoPorId('nope')
    expect(v).toBeNull()
  })
})
