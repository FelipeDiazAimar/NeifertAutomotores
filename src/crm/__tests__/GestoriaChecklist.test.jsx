// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const guardarCampos = { mutate: vi.fn() }
vi.mock('../hooks/useGestoria.js', () => ({
  useGestoria: () => ({ data: { estado: 'sin_iniciar' }, isLoading: false }),
  useGestoriaMutations: () => ({ guardarCampos }),
}))
vi.mock('../hooks/useCrmPerfil.js', () => ({ useCrmPerfil: () => ({ id: 'u1' }) }))

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
})
