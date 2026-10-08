// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import VehicleGallery from '../VehicleGallery'

const PICS = ['https://example.com/a.jpg', 'https://example.com/b.jpg']

function swipe(node, fromX, toX) {
  fireEvent.touchStart(node, { touches: [{ clientX: fromX }] })
  fireEvent.touchEnd(node, { changedTouches: [{ clientX: toX }] })
}

// El crossfade (AnimatePresence) mantiene la imagen saliente en el DOM:
// el dot activo es la señal autoritativa del índice.
function expectActiveDot(n) {
  expect(screen.getByRole('button', { name: `Ver imagen ${n}` }).className).toMatch('bg-neifert')
}

function renderedSrcs(container) {
  return [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))
}

describe('VehicleGallery', () => {
  it('swipe a la izquierda avanza de imagen y mueve el dot activo', () => {
    const { container } = render(<VehicleGallery images={PICS} alt="Test car" />)
    const gallery = container.firstChild
    expectActiveDot(1)

    swipe(gallery, 100, 30)

    expect(renderedSrcs(container)).toContain(PICS[1])
    expectActiveDot(2)
  })

  it('swipe a la derecha vuelve a la imagen anterior', () => {
    const { container } = render(<VehicleGallery images={PICS} alt="Test car" />)
    const gallery = container.firstChild

    swipe(gallery, 100, 30)
    expectActiveDot(2)

    swipe(gallery, 30, 100)
    expectActiveDot(1)
  })

  it('ignora desplazamientos menores al umbral (50px)', () => {
    const { container } = render(<VehicleGallery images={PICS} alt="Test car" />)
    swipe(container.firstChild, 100, 70)
    expectActiveDot(1)
    expect(renderedSrcs(container)).toEqual([PICS[0]])
  })
})
