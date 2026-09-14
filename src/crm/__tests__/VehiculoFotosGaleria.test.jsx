// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const foto1 = { id: 'f1', url: 'https://r2/1.jpg', es_portada: true, orden: 0 }
const foto2 = { id: 'f2', url: 'https://r2/2.jpg', es_portada: false, orden: 1 }

const listar = vi.fn().mockResolvedValue([foto1, foto2])
const subir = vi.fn().mockResolvedValue({ id: 'f3' })
const reordenar = vi.fn().mockResolvedValue(undefined)
vi.mock('@/crm/services/fotos.service', () => ({
  listar: (...args) => listar(...args),
  subir: (...args) => subir(...args),
  marcarPortada: vi.fn(),
  borrar: vi.fn(),
  reordenar: (...args) => reordenar(...args),
}))
vi.mock('@/crm/hooks/useCrmPerfil', () => ({ useCrmPerfil: () => ({ id: 'u1' }) }))

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('sonner', () => ({ toast }))

import VehiculoFotosGaleria from '../components/VehiculoFotosGaleria'

function renderGaleria() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <VehiculoFotosGaleria vehiculoId="v1" />
    </QueryClientProvider>,
  )
}

describe('VehiculoFotosGaleria', () => {
  it('soltar un archivo sobre el "+" alimenta el mismo flujo de carga (abre el recorte)', async () => {
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:x')
    global.URL.revokeObjectURL = vi.fn()
    global.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
    }))

    renderGaleria()
    const boton = await screen.findByLabelText('Agregar foto')
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    fireEvent.drop(boton, { dataTransfer: { files: [file] } })

    expect(await screen.findByText(/recortá la imagen/i)).toBeInTheDocument()
  })

  it('arrastrar el asa de una foto sobre otra reordena y llama a fotosSvc.reordenar', async () => {
    Element.prototype.setPointerCapture = vi.fn()
    const { container } = renderGaleria()
    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(2))

    // jsdom no calcula layout real: se simulan los rects de cada foto para
    // que moverArrastre() pueda distinguir "arriba de cuál está el puntero".
    const fotos = container.querySelectorAll('.group')
    fotos[0].getBoundingClientRect = () => ({ top: 0, bottom: 100 })
    fotos[1].getBoundingClientRect = () => ({ top: 100, bottom: 200 })

    const asas = screen.getAllByRole('button', { name: /arrastrar para reordenar/i })
    fireEvent.pointerDown(asas[0], { pointerId: 1, clientY: 50 })
    fireEvent.pointerMove(asas[0], { pointerId: 1, clientY: 150 })
    fireEvent.pointerUp(asas[0], { pointerId: 1 })

    await waitFor(() => expect(reordenar).toHaveBeenCalledWith(['f2', 'f1']))
  })

  it('si una foto no carga, muestra un ícono roto en vez del <img> y loguea en consola', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = renderGaleria()
    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(2))

    fireEvent.error(container.querySelectorAll('img')[0])

    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(1))
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('si falla el reordenamiento en el servidor, avisa y loguea en consola', async () => {
    Element.prototype.setPointerCapture = vi.fn()
    reordenar.mockRejectedValueOnce(new Error('no se pudo guardar el orden'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = renderGaleria()
    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(2))

    const fotos = container.querySelectorAll('.group')
    fotos[0].getBoundingClientRect = () => ({ top: 0, bottom: 100 })
    fotos[1].getBoundingClientRect = () => ({ top: 100, bottom: 200 })

    const asas = screen.getAllByRole('button', { name: /arrastrar para reordenar/i })
    fireEvent.pointerDown(asas[0], { pointerId: 1, clientY: 50 })
    fireEvent.pointerMove(asas[0], { pointerId: 1, clientY: 150 })
    fireEvent.pointerUp(asas[0], { pointerId: 1 })

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('no se pudo guardar el orden'))
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})
