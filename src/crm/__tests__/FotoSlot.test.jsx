// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/crm/services/fotos.service', () => ({
  subirArchivoUnico: vi.fn().mockResolvedValue('https://r2/x.jpg'),
}))

const { deleteMedia } = vi.hoisted(() => ({ deleteMedia: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/media.service', () => ({ deleteMedia }))

import FotoSlot from '../components/FotoSlot'

describe('FotoSlot', () => {
  it('sin foto, al elegir archivo llama onChange con la URL subida', async () => {
    const onChange = vi.fn()
    render(<FotoSlot label="Foto del seguro" url={null} carpeta="crm/gestoria/1" onChange={onChange} />)
    const input = screen.getByLabelText('Foto del seguro')
    const file = new File(['x'], 'seguro.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('https://r2/x.jpg'))
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
    global.fetch = vi.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob(['x'])) })
    const createObjectURL = vi.fn().mockReturnValue('blob:x')
    const revokeObjectURL = vi.fn()
    global.URL.createObjectURL = createObjectURL
    global.URL.revokeObjectURL = revokeObjectURL
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
})
