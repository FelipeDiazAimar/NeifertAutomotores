// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/crm/services/usuarios.service', () => ({ tokenActual: vi.fn().mockResolvedValue('tok') }))

describe('usePushNotifications', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    globalThis.navigator.serviceWorker = {
      register: vi.fn().mockResolvedValue({
        pushManager: {
          subscribe: vi.fn().mockResolvedValue({
            endpoint: 'https://x/1',
            toJSON: () => ({ endpoint: 'https://x/1', keys: { p256dh: 'p', auth: 'a' } }),
          }),
        },
      }),
    }
    globalThis.Notification = { requestPermission: vi.fn().mockResolvedValue('granted'), permission: 'default' }
    window.PushManager = window.PushManager || class {}
    import.meta.env.VITE_VAPID_PUBLIC_KEY = 'BLRrISy-ll4jdEYZ8k2d0NYVsQuAnE2wWHwZRWKWVoj-LauDMM953Mrrcgk3r9WEmA4_TVsDqbnyyAQ6Zo3_U3Y'
  })

  it('activar() pide permiso, se suscribe y manda la suscripción al backend', async () => {
    const { usePushNotifications } = await import('../hooks/usePushNotifications.js')
    const { result } = renderHook(() => usePushNotifications())
    await act(async () => { await result.current.activar() })
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/crm/usuarios', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body).toEqual({ accion: 'push_subscribe', endpoint: 'https://x/1', p256dh: 'p', auth: 'a' })
  })

  it('si el usuario no da permiso, no llama al backend', async () => {
    globalThis.Notification.requestPermission = vi.fn().mockResolvedValue('denied')
    const { usePushNotifications } = await import('../hooks/usePushNotifications.js')
    const { result } = renderHook(() => usePushNotifications())
    await act(async () => { await result.current.activar() })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
