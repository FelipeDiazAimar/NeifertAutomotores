// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import VehiculoThumb from '../components/VehiculoThumb'

describe('VehiculoThumb', () => {
  it('sin fotos, muestra "Sin foto"', () => {
    render(<VehiculoThumb fotos={[]} />)
    expect(screen.getByText('Sin foto')).toBeInTheDocument()
  })

  it('con fotos, muestra la portada', () => {
    const fotos = [{ id: 'a', url: 'https://r2/a.jpg', es_portada: false }, { id: 'b', url: 'https://r2/b.jpg', es_portada: true }]
    const { container } = render(<VehiculoThumb fotos={fotos} />)
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://r2/b.jpg')
  })

  it('si la portada no carga, cae a "Sin foto" y loguea en consola', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fotos = [{ id: 'a', url: 'https://r2/rota.jpg', es_portada: true }]
    const { container } = render(<VehiculoThumb fotos={fotos} />)
    fireEvent.error(container.querySelector('img'))
    expect(screen.getByText('Sin foto')).toBeInTheDocument()
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})
