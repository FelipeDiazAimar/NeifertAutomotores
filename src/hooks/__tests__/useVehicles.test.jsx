// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/crm/services/vehiculosPublico.service', () => ({
  listarPublicos: vi.fn().mockResolvedValue([{ id: '1', brand: 'Ford' }]),
  listarTodos: vi.fn().mockResolvedValue([{ id: '1', brand: 'Ford' }, { id: '2', brand: 'Fiat' }]),
  obtenerPublicoPorId: vi.fn().mockResolvedValue({ id: '1', brand: 'Ford' }),
}))

import { useVehicles, useVehicle, useAllVehicles } from '../useVehicles'

function wrapper({ children }) {
  const qc = new QueryClient()
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useVehicles', () => {
  it('resuelve con datos de vehiculosPublico.service.listarPublicos', async () => {
    const { result } = renderHook(() => useVehicles(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data[0].brand).toBe('Ford')
  })

  it('useVehicle resuelve un solo vehículo por id', async () => {
    const { result } = renderHook(() => useVehicle('1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data.brand).toBe('Ford')
  })

  it('useAllVehicles trae todos, sin filtrar', async () => {
    const { result } = renderHook(() => useAllVehicles(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
  })
})
