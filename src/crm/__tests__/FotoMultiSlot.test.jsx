// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const fotosData = [{ id: 'f1', url: 'https://r2/f1.jpg' }]
vi.mock('../hooks/useGestoriaFotos.js', () => ({
  useGestoriaFotos: () => ({ data: fotosData, isLoading: false }),
  useGestoriaFotosMutations: () => ({
    agregar: { mutate: vi.fn(), isPending: false },
    borrar: { mutate: vi.fn() },
  }),
}))

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('sonner', () => ({ toast }))

import FotoMultiSlot from '../components/FotoMultiSlot'

describe('FotoMultiSlot', () => {
  it('abre el visor con zoom y descarga con nombre marca/modelo/patente + índice', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(['x'])) })
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:x')
    globalThis.URL.revokeObjectURL = vi.fn()
    let nombreDescargado = null
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      nombreDescargado = this.download
    })

    const vehiculo = { marca: 'Ford', modelo: 'Ranger', patente: 'AB123CD' }
    render(<FotoMultiSlot label="Título — frente" slot="titulo_frente" vehiculoId="v1" vehiculo={vehiculo} />)

    fireEvent.click(screen.getByRole('button', { name: /ver título — frente 1/i }))
    expect(await screen.findByRole('button', { name: /aumentar zoom/i })).toBeInTheDocument()
    expect(screen.getAllByText('100%')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /aumentar zoom/i }))
    expect(screen.getByText('125%')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /descargar/i }))
    await waitFor(() => expect(clickSpy).toHaveBeenCalled())
    expect(nombreDescargado).toBe('ford_ranger_ab123cd_titulo_frente_1.jpg')
    clickSpy.mockRestore()
  })

  it('si R2 responde sin ok (CORS), hace fallback a window.open', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, blob: () => Promise.resolve(new Blob(['x'])) })
    const openSpy = vi.fn()
    Object.defineProperty(window, 'open', { value: openSpy, writable: true, configurable: true })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<FotoMultiSlot label="Título — frente" slot="titulo_frente" vehiculoId="v1" />)
    fireEvent.click(screen.getByRole('button', { name: /ver título — frente 1/i }))
    fireEvent.click(await screen.findByRole('button', { name: /descargar/i }))

    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://r2/f1.jpg', '_blank'))
    expect(clickSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalled()
    clickSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })
})
