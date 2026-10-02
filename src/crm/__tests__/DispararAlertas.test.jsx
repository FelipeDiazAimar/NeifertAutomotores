// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DispararAlertas from '../components/DispararAlertas'

const dispararAlertasMock = vi.fn()
vi.mock('@/crm/services/alertas.service', () => ({
  dispararAlertas: (...args) => dispararAlertasMock(...args),
}))
const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { success: (...a) => toastSuccess(...a), error: (...a) => toastError(...a) } }))

describe('DispararAlertas', () => {
  beforeEach(() => vi.clearAllMocks())

  it('dispara la revisión y avisa cuántos salieron', async () => {
    dispararAlertasMock.mockResolvedValue({ ok: true, enviadas: 2, errores: [] })
    render(<DispararAlertas />)
    fireEvent.click(screen.getByRole('button', { name: /probar avisos/i }))
    await waitFor(() => expect(dispararAlertasMock).toHaveBeenCalled())
    expect(toastSuccess).toHaveBeenCalledWith('Avisos enviados: 2.')
  })

  it('sin avisos pendientes lo dice sin error', async () => {
    dispararAlertasMock.mockResolvedValue({ ok: true, enviadas: 0, errores: [] })
    render(<DispararAlertas />)
    fireEvent.click(screen.getByRole('button', { name: /probar avisos/i }))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Sin avisos pendientes a esta hora.'))
  })

  it('si falla muestra el error', async () => {
    dispararAlertasMock.mockRejectedValue(new Error('No tenés permiso'))
    render(<DispararAlertas />)
    fireEvent.click(screen.getByRole('button', { name: /probar avisos/i }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('No tenés permiso'))
  })
})
