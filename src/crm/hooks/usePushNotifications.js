import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { tokenActual } from '@/crm/services/usuarios.service'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function usePushNotifications() {
  const [activando, setActivando] = useState(false)
  const soportado = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window

  const activar = useCallback(async () => {
    if (!soportado) return toast.error('Este navegador no soporta notificaciones de escritorio.')
    setActivando(true)
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') return toast.error('No diste permiso para las notificaciones.')

      const reg = await navigator.serviceWorker.register('/sw.js')
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
      })
      const json = sub.toJSON()
      const token = await tokenActual()
      const res = await fetch('/api/crm/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }),
      })
      if (!res.ok) throw new Error('No se pudo guardar la suscripción en el servidor.')
      toast.success('Notificaciones de escritorio activadas.')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setActivando(false)
    }
  }, [soportado])

  return { activar, activando, soportado }
}
