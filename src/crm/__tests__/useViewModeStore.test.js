// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'

const STORAGE_KEY = 'nf-crm-view-mode'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('useViewModeStore', () => {
  it('por defecto arranca en "list" si no hay nada guardado', async () => {
    const { useViewModeStore } = await import('../store/useViewModeStore.js')
    expect(useViewModeStore.getState().viewMode).toBe('list')
  })

  it('setViewMode persiste en localStorage y actualiza el estado', async () => {
    const { useViewModeStore } = await import('../store/useViewModeStore.js')
    useViewModeStore.getState().setViewMode('card')
    expect(useViewModeStore.getState().viewMode).toBe('card')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('card')
  })

  it('al recargar (nueva instancia del módulo) recuerda la última elección', async () => {
    localStorage.setItem(STORAGE_KEY, 'card')
    const { useViewModeStore } = await import('../store/useViewModeStore.js')
    expect(useViewModeStore.getState().viewMode).toBe('card')
  })
})
