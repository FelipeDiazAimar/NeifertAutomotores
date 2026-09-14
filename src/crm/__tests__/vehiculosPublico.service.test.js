import { describe, it, expect, vi } from 'vitest'

const selectMock = vi.fn()
vi.mock('@/services/supabaseClient', () => ({
  supabase: { schema: () => ({ from: () => ({ select: selectMock }) }) },
}))

import { listarPublicos, obtenerPublicoPorId } from '../services/vehiculosPublico.service'

function chain(finalResult) {
  const c = {
    eq: vi.fn(() => c),
    or: vi.fn(() => c),
    in: vi.fn(() => c),
    gte: vi.fn(() => c),
    lte: vi.fn(() => c),
    order: vi.fn(() => Promise.resolve(finalResult)),
    maybeSingle: vi.fn(() => Promise.resolve(finalResult)),
  }
  return c
}

describe('vehiculosPublico.service', () => {
  it('listarPublicos selecciona solo columnas públicas, nunca privadas', async () => {
    selectMock.mockReturnValue(chain({ data: [], error: null }))
    await listarPublicos()
    const columnasSeleccionadas = selectMock.mock.calls[0][0]
    for (const privada of ['duenio_nombre', 'itv', 'patente', 'nota', 'consignacion']) {
      expect(columnasSeleccionadas).not.toContain(privada)
    }
    expect(columnasSeleccionadas).toContain('precio_usd')
  })

  it('listarPublicos mapea filas de crm.vehiculos al shape en inglés que usa la UI', async () => {
    const fila = {
      id: 'v1', marca: 'Ford', modelo: 'Fiesta', version: 'S', color: 'Rojo', anio: 2020,
      moneda: 'USD', precio_contado: 15000, precio_usd: 15000, km: 40000, combustible: 'Nafta',
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
      id: 'v1', brand: 'Ford', model: 'Fiesta', year: 2020, price_usd: 15000,
      fuel_type: 'Nafta', transmission: 'Manual', category: 'sedan', is_new: false,
      main_image_url: 'https://x/1.jpg', images: ['https://x/1.jpg', 'https://x/2.jpg'],
    })
  })

  it('obtenerPublicoPorId devuelve null si no hay match', async () => {
    selectMock.mockReturnValue(chain({ data: null, error: null }))
    const v = await obtenerPublicoPorId('nope')
    expect(v).toBeNull()
  })
})
