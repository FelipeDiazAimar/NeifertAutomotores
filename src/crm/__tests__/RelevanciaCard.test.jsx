// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RelevanciaCard from '../components/RelevanciaCard.jsx'

const V = { id: 'a', marca: 'Ford', modelo: 'Ka', version: 'SE', anio: 2019, km: 50000, estado: 'disponible', moneda: 'USD', precio_contado: 9000, duenio_nombre: 'Ana', duenio_apellido: 'Paz', fotos: [] }
const TT = { w: 280, h: 400 }

function montar(rect, viewport) {
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: viewport.w })
  window.innerHeight = viewport.h
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ ...rect, width: rect.right - rect.left, height: 100, bottom: rect.top + 100 })
  render(<RelevanciaCard vehiculo={V} posicion={3} />)
  fireEvent.mouseEnter(screen.getByText('Ford Ka').closest('div[class*="glass"]'))
  return screen.getByRole('tooltip')
}

describe('RelevanciaCard — tooltip dentro de la pantalla', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(TT.w)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(TT.h)
  })
  afterEach(() => vi.restoreAllMocks())

  it('si entra a la derecha, va a la derecha de la card', () => {
    const t = montar({ left: 100, right: 260, top: 50 }, { w: 1200, h: 800 })
    expect(parseFloat(t.style.left)).toBe(268)
    expect(t.style.visibility).toBe('visible')
  })

  it('si no entra a la derecha, pasa a la izquierda de la card', () => {
    const t = montar({ left: 900, right: 1060, top: 50 }, { w: 1100, h: 800 })
    expect(parseFloat(t.style.left)).toBe(900 - 280 - 8)
  })

  it('abajo no se sale: se sube hasta que entre completo', () => {
    const t = montar({ left: 100, right: 260, top: 700 }, { w: 1200, h: 800 })
    expect(parseFloat(t.style.top) + TT.h).toBeLessThanOrEqual(800 - 8)
  })

  it('en pantalla angosta queda dentro de los márgenes aunque tape la card', () => {
    const t = montar({ left: 10, right: 190, top: 20 }, { w: 300, h: 800 })
    const left = parseFloat(t.style.left)
    expect(left).toBeGreaterThanOrEqual(8)
    expect(left + TT.w).toBeLessThanOrEqual(300 - 8)
  })

  it('muestra el dueño y los datos para distinguir el auto', () => {
    montar({ left: 100, right: 260, top: 50 }, { w: 1200, h: 800 })
    expect(screen.getByText(/Ana Paz/)).toBeTruthy()
    expect(screen.getByText(/U\$S 9\.000/)).toBeTruthy()
  })
})

describe('RelevanciaCard — cinta de estado', () => {
  const cinta = (estado) => {
    const { unmount } = render(<RelevanciaCard vehiculo={{ ...V, estado }} posicion={1} />)
    const out = { vendido: screen.queryByText('Vendido'), reservado: screen.queryByText('Reservado') }
    unmount()
    return out
  }
  it('vendido y reservado llevan su cinta diagonal; disponible no', () => {
    expect(cinta('vendido')).toEqual({ vendido: expect.anything(), reservado: null })
    expect(cinta('reservado')).toEqual({ vendido: null, reservado: expect.anything() })
    expect(cinta('disponible')).toEqual({ vendido: null, reservado: null })
  })
})
