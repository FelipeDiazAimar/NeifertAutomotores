// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const crear = vi.fn().mockResolvedValue({ id: 1 })
const actualizar = vi.fn().mockResolvedValue({ id: 1 })
vi.mock('@/crm/services/alertas.service', () => ({
  crear: (...a) => crear(...a), actualizar: (...a) => actualizar(...a), listar: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/crm/hooks/useCrmUsuarios', () => ({ useCrmUsuarios: () => ({ data: [{ id: 'u1', nombre: 'Bruno' }] }) }))
vi.mock('@/crm/hooks/useCrmPerfil', () => ({ useCrmPerfil: () => ({ id: 'u1' }) }))
vi.mock('@/crm/hooks/useClientes', () => ({ useClientes: () => ({ data: { filas: [] } }) }))
vi.mock('@/crm/hooks/useVehiculos', () => ({ useVehiculos: () => ({ data: { filas: [] } }) }))

import AlertaFormModal from '../components/AlertaFormModal'

function renderModal(props = {}) {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <AlertaFormModal open onClose={vi.fn()} alerta={null} {...props} />
    </QueryClientProvider>,
  )
}

describe('AlertaFormModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('carga una alerta nueva con título/fecha/hora/asignado', async () => {
    renderModal()
    await userEvent.type(screen.getByLabelText('Título'), 'ITV Cronos')
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() => expect(crear).toHaveBeenCalled())
    expect(crear.mock.calls[0][0]).toMatchObject({ titulo: 'ITV Cronos', asignado_a: 'u1', hora: '09:00' })
  })

  it('reprogramar la hora reactiva el aviso (resetea los flags)', async () => {
    renderModal({
      alerta: { id: 7, titulo: 'ITV', descripcion: '', fecha: '2026-10-01', hora: '10:00', asignado_a: 'u1', notificado_push: true, notificado_email: true },
    })
    const hora = screen.getByLabelText('Hora')
    await userEvent.clear(hora)
    await userEvent.type(hora, '11:00')
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() => expect(actualizar).toHaveBeenCalled())
    expect(actualizar.mock.calls[0][0]).toBe(7)
    expect(actualizar.mock.calls[0][1]).toMatchObject({ notificado_push: false, notificado_email: false })
  })

  it('guardar sin cambiar hora/fecha/destinatario no toca los flags', async () => {
    renderModal({
      alerta: { id: 7, titulo: 'ITV', descripcion: '', fecha: '2026-10-01', hora: '10:00', asignado_a: 'u1', notificado_push: true, notificado_email: true },
    })
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() => expect(actualizar).toHaveBeenCalled())
    expect(actualizar.mock.calls[0][1]).not.toHaveProperty('notificado_push')
    expect(actualizar.mock.calls[0][1]).not.toHaveProperty('notificado_email')
  })
})
