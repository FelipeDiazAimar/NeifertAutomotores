import { describe, it, expect, vi } from 'vitest'

describe('webPush.enviarPush', () => {
  it('manda la notificación a cada suscripción con el payload dado', async () => {
    const sendNotification = vi.fn().mockResolvedValue({})
    const setVapidDetails = vi.fn()
    const { enviarPush } = await import('../webPush.js')
    const subs = [{ endpoint: 'https://x/1', p256dh: 'p1', auth: 'a1' }]
    await enviarPush(
      { subscriptions: subs, payload: { title: 't', body: 'b' } },
      { webpush: { setVapidDetails, sendNotification }, vapid: { subject: 's', publicKey: 'pub', privateKey: 'priv' } },
    )
    expect(setVapidDetails).toHaveBeenCalledWith('s', 'pub', 'priv')
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: 'https://x/1', keys: { p256dh: 'p1', auth: 'a1' } },
      JSON.stringify({ title: 't', body: 'b' }),
    )
  })

  it('si una suscripción está vencida (410), la reporta para borrar pero no frena las demás', async () => {
    const sendNotification = vi.fn()
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockResolvedValueOnce({})
    const { enviarPush } = await import('../webPush.js')
    const subs = [{ endpoint: 'https://x/vencida', p256dh: 'p', auth: 'a' }, { endpoint: 'https://x/2', p256dh: 'p', auth: 'a' }]
    const { vencidas } = await enviarPush(
      { subscriptions: subs, payload: {} },
      { webpush: { setVapidDetails: vi.fn(), sendNotification }, vapid: { subject: 's', publicKey: 'pub', privateKey: 'priv' } },
    )
    expect(vencidas).toEqual(['https://x/vencida'])
    expect(sendNotification).toHaveBeenCalledTimes(2)
  })
})
