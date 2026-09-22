// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const crear = vi.fn().mockResolvedValue({ id: 1 })
vi.mock('@/crm/services/alertas.service', () => ({
  crear: (...a) => crear(...a), actualizar: vi.fn(), listar: vi.fn().mockResolvedValue([]),
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
  it('carga una alerta nueva con título/fecha/hora/asignado', async () => {
    renderModal()
    await userEvent.type(screen.getByLabelText('Título'), 'ITV Cronos')
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() => expect(crear).toHaveBeenCalled())
    expect(crear.mock.calls[0][0]).toMatchObject({ titulo: 'ITV Cronos', asignado_a: 'u1', hora: '09:00' })
  })
})
