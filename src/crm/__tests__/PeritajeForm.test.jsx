// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PeritajeForm from '../components/PeritajeForm.jsx'

vi.mock('../hooks/useCrmUsuarios.js', () => ({ useCrmUsuarios: () => ({ data: [] }) }))
vi.mock('../hooks/useCrmPerfil.js', () => ({ useCrmPerfil: () => ({ id: 'u1' }) }))

function wrap(ui) {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('PeritajeForm', () => {
  it('marcar un ítem como Falta actualiza el strip y se envía en datos', async () => {
    const onGuardar = vi.fn()
    wrap(<PeritajeForm onGuardar={onGuardar} />)

    // el strip arranca en 0/0/0
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringMatching(/0 ok, 0 observaciones, 0 fallas/))

    // Motor está en la sección "Motor y transmisión" (abierta por defecto)
    const filaMotor = screen.getByText('Motor').closest('div')
    await userEvent.click(within(filaMotor).getByRole('button', { name: 'Falta' }))

    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringMatching(/0 ok, 0 observaciones, 1 fallas/))

    await userEvent.click(screen.getByRole('button', { name: /guardar peritaje/i }))
    expect(onGuardar).toHaveBeenCalledTimes(1)
    expect(onGuardar.mock.calls[0][0].datos.motor).toBe('falta')
  })
})
