import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { tokenActual, desuscribirPush } from '@/crm/services/usuarios.service'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

const SOPORTADO =
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window

async function suscripcionActual() {
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    return await reg?.pushManager.getSubscription()
  } catch {
    return null
  }
}

/** Estado y acciones de las notificaciones push de este navegador.
 *  `estado`: 'cargando' | 'activadas' | 'apagadas' | 'bloqueadas' | 'no-soportado'. */
export function usePushNotifications() {
  const [activando, setActivando] = useState(false)
  const [estado, setEstado] = useState(SOPORTADO ? 'cargando' : 'no-soportado')

  const refrescar = useCallback(async () => {
    if (!SOPORTADO) {
      setEstado('no-soportado')
      return
    }
    if (Notification.permission === 'denied') {
      setEstado('bloqueadas')
      return
    }
    setEstado((await suscripcionActual()) ? 'activadas' : 'apagadas')
  }, [])

  // Sincroniza con el estado real del navegador (sistema externo): permiso
  // + suscripción push existente.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync con API externa del navegador
    refrescar()
  }, [refrescar])

  // El permiso puede cambiar en la configuración del navegador con la app
  // abierta: al volver a la pestaña se revalida el indicador.
  useEffect(() => {
    window.addEventListener('focus', refrescar)
    document.addEventListener('visibilitychange', refrescar)
    return () => {
      window.removeEventListener('focus', refrescar)
      document.removeEventListener('visibilitychange', refrescar)
    }
  }, [refrescar])

  const activar = useCallback(async () => {
    if (!SOPORTADO)
      return toast.error('Este navegador no soporta notificaciones de escritorio.')
    setActivando(true)
    let sub = null
    try {
      // Si ya está bloqueado, el navegador no vuelve a preguntar: hay que
      // desbloquearlo a mano en la configuración del sitio.
      if (Notification.permission === 'denied') {
        toast.error(
          'Bloqueaste las notificaciones en el navegador. Tocá el candadito de la barra de direcciones → Notificaciones → Permitir, y probá de nuevo.',
          { duration: 9000 }
        )
        return false
      }
      if (Notification.permission !== 'granted') {
        const permiso = await Notification.requestPermission()
        if (permiso !== 'granted') {
          toast.error('No diste permiso para las notificaciones.')
          return false
        }
      }

      const reg = await navigator.serviceWorker.register('/sw.js')
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          import.meta.env.VITE_VAPID_PUBLIC_KEY
        ),
      })
      const json = sub.toJSON()
      const token = await tokenActual()
      const res = await fetch('/api/crm/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          accion: 'push_subscribe',
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || 'No se pudo guardar la suscripción en el servidor.')
      }
      toast.success('Notificaciones de escritorio activadas.')
      await refrescar()
      return true
    } catch (e) {
      // Si el servidor rechazó el guardado, la suscripción local queda
      // huérfana (la campana mostraría verde pero no llegaría nada): se borra
      // para reintentar desde cero.
      try {
        await sub?.unsubscribe()
      } catch {
        // no-op
      }
      toast.error(e.message)
      await refrescar()
      return false
    } finally {
      setActivando(false)
    }
  }, [refrescar])

  const desactivar = useCallback(async () => {
    if (!SOPORTADO) return
    setActivando(true)
    try {
      const sub = await suscripcionActual()
      const endpoint = sub?.endpoint
      if (sub) await sub.unsubscribe()
      if (endpoint) {
        try {
          await desuscribirPush(endpoint)
        } catch (e) {
          toast.error(`Se desactivó en el navegador pero no en el servidor: ${e.message}`)
        }
      }
      toast.success('Notificaciones desactivadas en este navegador.')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setActivando(false)
      await refrescar()
    }
  }, [refrescar])

  return { activar, desactivar, refrescar, activando, estado, soportado: SOPORTADO }
}
