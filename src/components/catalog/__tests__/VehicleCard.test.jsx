// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/crm/lib/formatVehiculo', async (importOriginal) => {
  const orig = await importOriginal()
  if (orig.esNuevoVigente) return orig
  const NUEVO_VIGENCIA_MS = 14 * 24 * 60 * 60 * 1000
  const esNuevoVigente = (v) => {
    if (!v) return false
    if (!(v.is_new ?? v.es_nuevo ?? false)) return false
    const fecha = v.es_nuevo_en ?? v.created_at ?? v.creado_en ?? null
    if (!fecha) return true
    const ts = new Date(fecha).getTime()
    if (Number.isNaN(ts)) return true
    return Date.now() - ts < NUEVO_VIGENCIA_MS
  }
  return { ...orig, esNuevoVigente, NUEVO_VIGENCIA_MS }
})

const { default: VehicleCard } = await import('../VehicleCard.jsx')

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}

const DAY = 86_400_000
const isoDiasAtras = (dias) => new Date(Date.now() - dias * DAY).toISOString()

const base = {
  id: 'v1',
  brand: 'Toyota',
  model: 'Hilux',
  year: 2024,
  km: 1000,
  fuel_type: 'Nafta',
  transmission: 'Manual',
  price_amount: 32000,
  currency: 'USD',
  status: 'disponible',
  images: [],
  main_image_url: '',
}

function renderCard(vehicle) {
  return render(
    <MemoryRouter>
      <VehicleCard vehicle={vehicle} />
    </MemoryRouter>
  )
}

describe('VehicleCard badges', () => {
  it('muestra "Nuevo" vigente (13 días)', () => {
    renderCard({ ...base, is_new: true, created_at: isoDiasAtras(13) })
    expect(screen.getAllByText('Nuevo').length).toBeGreaterThanOrEqual(1)
  })

  it('oculta "Nuevo" vencido (15 días)', () => {
    renderCard({ ...base, is_new: true, created_at: isoDiasAtras(15) })
    expect(screen.queryByText('Nuevo')).not.toBeInTheDocument()
  })

  it('chip 0km usa text-bg (legible en dark)', () => {
    renderCard({ ...base, is_zero_km: true })
    const chips = screen.getAllByText('0 km')
    expect(chips.length).toBeGreaterThanOrEqual(1)
    for (const chip of chips) {
      expect(chip.className).toMatch(/text-bg/)
      expect(chip.className).not.toMatch(/text-white/)
    }
  })
})
