// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const desuscribirPushMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }))
vi.mock('@/crm/services/usuarios.service', () => ({
  tokenActual: vi.fn().mockResolvedValue('tok'),
  desuscribirPush: (...args) => desuscribirPushMock(...args),
}))

describe('usePushNotifications', () => {
  beforeEach(() => {
    desuscribirPushMock.mockClear()
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    globalThis.navigator.serviceWorker = {
      register: vi.fn().mockResolvedValue({
        pushManager: {
          subscribe: vi.fn().mockResolvedValue({
            endpoint: 'https://x/1',
            toJSON: () => ({ endpoint: 'https://x/1', keys: { p256dh: 'p', auth: 'a' } }),
          }),
          getSubscription: vi.fn().mockResolvedValue(null),
        },
      }),
      getRegistration: vi.fn().mockResolvedValue({
        pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
      }),
    }
    globalThis.Notification = {
      requestPermission: vi.fn().mockResolvedValue('granted'),
      permission: 'default',
    }
    window.PushManager = window.PushManager || class {}
    import.meta.env.VITE_VAPID_PUBLIC_KEY =
      'BLRrISy-ll4jdEYZ8k2d0NYVsQuAnE2wWHwZRWKWVoj-LauDMM953Mrrcgk3r9WEmA4_TVsDqbnyyAQ6Zo3_U3Y'
  })

  it('activar() pide permiso, se suscribe y manda la suscripción al backend', async () => {
    const { usePushNotifications } = await import('../hooks/usePushNotifications.js')
    const { result } = renderHook(() => usePushNotifications())
    await act(async () => {
      await result.current.activar()
    })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/crm/usuarios',
      expect.objectContaining({ method: 'POST' })
    )
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body).toEqual({
      accion: 'push_subscribe',
      endpoint: 'https://x/1',
      p256dh: 'p',
      auth: 'a',
    })
  })

  it('si el usuario no da permiso, no llama al backend', async () => {
    globalThis.Notification.requestPermission = vi.fn().mockResolvedValue('denied')
    const { usePushNotifications } = await import('../hooks/usePushNotifications.js')
    const { result } = renderHook(() => usePushNotifications())
    await act(async () => {
      await result.current.activar()
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('si el permiso ya está bloqueado, no pregunta y explica cómo desbloquearlo', async () => {
    globalThis.Notification.permission = 'denied'
    const pedir = vi.fn()
    globalThis.Notification.requestPermission = pedir
    const { usePushNotifications } = await import('../hooks/usePushNotifications.js')
    const { result } = renderHook(() => usePushNotifications())
    await act(async () => {
      await result.current.activar()
    })
    expect(pedir).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('si el permiso ya está dado, se suscribe sin volver a preguntar', async () => {
    globalThis.Notification.permission = 'granted'
    const pedir = vi.fn()
    globalThis.Notification.requestPermission = pedir
    const { usePushNotifications } = await import('../hooks/usePushNotifications.js')
    const { result } = renderHook(() => usePushNotifications())
    await act(async () => {
      await result.current.activar()
    })
    expect(pedir).not.toHaveBeenCalled()
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/crm/usuarios',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('informa estado activadas si ya hay suscripción', async () => {
    globalThis.Notification.permission = 'granted'
    globalThis.navigator.serviceWorker.getRegistration = vi.fn().mockResolvedValue({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue({ endpoint: 'https://x/1' }),
      },
    })
    const { usePushNotifications } = await import('../hooks/usePushNotifications.js')
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.estado).toBe('activadas'))
  })

  it('informa estado bloqueadas si el permiso está denegado', async () => {
    globalThis.Notification.permission = 'denied'
    const { usePushNotifications } = await import('../hooks/usePushNotifications.js')
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.estado).toBe('bloqueadas'))
  })

  it('si el servidor rechaza el guardado, muestra su error y borra la suscripción local', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true)
    globalThis.navigator.serviceWorker.register = vi.fn().mockResolvedValue({
      pushManager: {
        subscribe: vi.fn().mockResolvedValue({
          endpoint: 'https://x/1',
          unsubscribe,
          toJSON: () => ({ endpoint: 'https://x/1', keys: { p256dh: 'p', auth: 'a' } }),
        }),
        getSubscription: vi.fn().mockResolvedValue(null),
      },
    })
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({
        ok: false,
        json: async () => ({ ok: false, error: 'Sesión inválida' }),
      })
    const { usePushNotifications } = await import('../hooks/usePushNotifications.js')
    const { result } = renderHook(() => usePushNotifications())
    let ret
    await act(async () => {
      ret = await result.current.activar()
    })
    expect(ret).toBe(false)
    expect(unsubscribe).toHaveBeenCalled()
    await waitFor(() => expect(result.current.estado).toBe('apagadas'))
  })

  it('desactivar() desuscribe en el navegador y borra en el servidor', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true)
    const endpoint = 'https://x/9'
    globalThis.navigator.serviceWorker.getRegistration = vi.fn().mockResolvedValue({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue({ endpoint, unsubscribe }),
      },
    })
    const { usePushNotifications } = await import('../hooks/usePushNotifications.js')
    const { result } = renderHook(() => usePushNotifications())
    await act(async () => {
      await result.current.desactivar()
    })
    expect(unsubscribe).toHaveBeenCalled()
    expect(desuscribirPushMock).toHaveBeenCalledWith(endpoint)
  })
})
