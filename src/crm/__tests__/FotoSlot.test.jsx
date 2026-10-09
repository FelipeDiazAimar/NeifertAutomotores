// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { subirArchivoUnico } = vi.hoisted(() => ({ subirArchivoUnico: vi.fn() }))
vi.mock('@/crm/services/fotos.service', () => ({ subirArchivoUnico }))

const { deleteMedia } = vi.hoisted(() => ({ deleteMedia: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/media.service', () => ({ deleteMedia }))

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('sonner', () => ({ toast }))

import FotoSlot from '../components/FotoSlot'

beforeEach(() => {
  subirArchivoUnico.mockReset().mockResolvedValue('https://r2/x.jpg')
  toast.success.mockClear()
  toast.error.mockClear()
})

describe('FotoSlot', () => {
  it('sin foto, al elegir archivo llama onChange con la URL subida', async () => {
    const onChange = vi.fn()
    render(<FotoSlot label="Foto del seguro" url={null} carpeta="crm/gestoria/1" onChange={onChange} />)
    const input = screen.getByLabelText('Foto del seguro')
    const file = new File(['x'], 'seguro.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('https://r2/x.jpg'))
    expect(toast.success).toHaveBeenCalledWith('Foto subida correctamente.')
  })

  it('si la subida falla, muestra el error y lo loguea en consola', async () => {
    subirArchivoUnico.mockRejectedValue(new Error('falló la red'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onChange = vi.fn()
    render(<FotoSlot label="Foto del seguro" url={null} carpeta="crm/gestoria/1" onChange={onChange} />)
    const input = screen.getByLabelText('Foto del seguro')
    const file = new File(['x'], 'seguro.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('falló la red'))
    expect(consoleErrorSpy).toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('si la imagen ya cargada no puede mostrarse, cae a un aviso en vez de un ícono roto', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<FotoSlot label="Título — frente" url="https://r2/rota.jpg" carpeta="crm/gestoria/1" onChange={vi.fn()} />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByText(/no se pudo cargar la imagen/i)).toBeInTheDocument()
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('con foto cargada, muestra la imagen en 4:3 y un botón borrar que llama onChange(null) y borra en R2', () => {
    deleteMedia.mockClear()
    const onChange = vi.fn()
    render(<FotoSlot label="Título — frente" url="https://r2/y.jpg" carpeta="crm/gestoria/1" onChange={onChange} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://r2/y.jpg')
    fireEvent.click(screen.getByRole('button', { name: /borrar/i }))
    expect(onChange).toHaveBeenCalledWith(null)
    expect(deleteMedia).toHaveBeenCalledWith('https://r2/y.jpg')
  })

  it('al reemplazar una foto ya cargada, borra la anterior en R2', async () => {
    deleteMedia.mockClear()
    const onChange = vi.fn()
    render(<FotoSlot label="Foto del seguro" url="https://r2/vieja.jpg" carpeta="crm/gestoria/1" onChange={onChange} />)
    const input = screen.getByLabelText('Foto del seguro')
    const file = new File(['x'], 'nueva.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('https://r2/x.jpg'))
    expect(deleteMedia).toHaveBeenCalledWith('https://r2/vieja.jpg')
  })

  it('el nombre de descarga incluye marca/modelo/patente, no solo el tipo de foto', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(['x'])) })
    const createObjectURL = vi.fn().mockReturnValue('blob:x')
    const revokeObjectURL = vi.fn()
    globalThis.URL.createObjectURL = createObjectURL
    globalThis.URL.revokeObjectURL = revokeObjectURL
    let nombreDescargado = null
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      nombreDescargado = this.download
    })

    const vehiculo = { marca: 'Ford', modelo: 'Ranger', patente: 'AB123CD' }
    render(
      <FotoSlot
        label="Título — frente"
        url="https://r2/y.jpg"
        carpeta="crm/gestoria/1"
        onChange={vi.fn()}
        vehiculo={vehiculo}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /ver título — frente/i }))
    fireEvent.click(await screen.findByRole('button', { name: /descargar/i }))

    await waitFor(() => expect(clickSpy).toHaveBeenCalled())
    expect(nombreDescargado).toBe('ford_ranger_ab123cd_titulo_frente.jpg')
    clickSpy.mockRestore()
  })

  it('el visor muestra zoom con botones +/−, 100% y doble-click toggle', async () => {
    render(
      <FotoSlot label="Título — frente" url="https://r2/y.jpg" carpeta="crm/gestoria/1" onChange={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /ver título — frente/i }))
    expect(await screen.findByRole('button', { name: /aumentar zoom/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reducir zoom/i })).toBeInTheDocument()
    expect(screen.getAllByText('100%')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /aumentar zoom/i }))
    expect(screen.getByText('125%')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /reducir zoom/i }))
    expect(screen.getAllByText('100%')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /aumentar zoom/i }))
    fireEvent.click(screen.getByRole('button', { name: /restablecer zoom/i }))
    expect(screen.getAllByText('100%')).toHaveLength(2)

    fireEvent.doubleClick(screen.getByAltText('titulo_frente.jpg'))
    expect(screen.getByText('200%')).toBeInTheDocument()
  })

  it('si R2 responde sin ok (CORS), hace fallback a window.open y loguea url+status', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, blob: () => Promise.resolve(new Blob(['x'])) })
    const openSpy = vi.fn()
    Object.defineProperty(window, 'open', { value: openSpy, writable: true, configurable: true })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(
      <FotoSlot label="Título — frente" url="https://r2/y.jpg" carpeta="crm/gestoria/1" onChange={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /ver título — frente/i }))
    fireEvent.click(await screen.findByRole('button', { name: /descargar/i }))

    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://r2/y.jpg', '_blank'))
    expect(clickSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[descargarImagen]'),
      'https://r2/y.jpg',
      expect.anything(),
    )
    clickSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })
})
