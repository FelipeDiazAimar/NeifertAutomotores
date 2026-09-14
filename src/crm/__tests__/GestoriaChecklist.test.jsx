// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const guardarCampos = { mutate: vi.fn() }
let gestoriaData = { estado: 'sin_iniciar' }
vi.mock('../hooks/useGestoria.js', () => ({
  useGestoria: () => ({ data: gestoriaData, isLoading: false }),
  useGestoriaMutations: () => ({ guardarCampos }),
}))
vi.mock('../hooks/useCrmPerfil.js', () => ({ useCrmPerfil: () => ({ id: 'u1' }) }))
vi.mock('@/crm/services/fotos.service', () => ({
  subirArchivoUnico: vi.fn().mockResolvedValue('https://r2/x.jpg'),
}))

const { default: GestoriaChecklist } = await import('../components/GestoriaChecklist.jsx')

describe('GestoriaChecklist', () => {
  it('togglear Formulario 08 llama guardarCampos con form08_hecho y fecha', async () => {
    guardarCampos.mutate.mockReset()
    render(<GestoriaChecklist vehiculoId="v1" />)
    await userEvent.click(screen.getByRole('button', { name: /Formulario 08: pendiente/i }))
    expect(guardarCampos.mutate).toHaveBeenCalledTimes(1)
    const parche = guardarCampos.mutate.mock.calls[0][0]
    expect(parche.form08_hecho).toBe(true)
    expect(parche.form08_fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(parche.form08_por).toBe('u1')
  })

  it('la sección Documentación (al final) tiene los 2 FotoSlot y persiste con guardarCampos', async () => {
    guardarCampos.mutate.mockReset()
    gestoriaData = { estado: 'sin_iniciar', foto_titulo_frente_url: null }
    render(<GestoriaChecklist vehiculoId="v1" />)
    expect(screen.queryByText('Foto del seguro')).not.toBeInTheDocument()
    expect(screen.getByText('Título — frente')).toBeInTheDocument()
    expect(screen.getByText('Título — dorso')).toBeInTheDocument()

    const input = screen.getByLabelText('Título — frente')
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })
    await waitFor(() => expect(guardarCampos.mutate).toHaveBeenCalledWith({ foto_titulo_frente_url: 'https://r2/x.jpg' }))
  })
})
