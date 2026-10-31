import { Bell, BellOff, BellRing } from 'lucide-react'
import { toast } from 'sonner'
import { usePushNotifications } from '@/crm/hooks/usePushNotifications'
import { cn } from '@/lib/cn'

/** Campanita del sidebar: indica el estado de las notificaciones de ESTE
 *  navegador y permite activarlas o desactivarlas.
 *  - activadas: campana llena verde, clic → desactiva (navegador + servidor).
 *  - apagadas: campana gris, clic → pide permiso al navegador y suscribe.
 *  - bloqueadas: campana tachada roja, clic → explica cómo desbloquear. */
export default function ActivarNotificaciones() {
  const { estado, activar, desactivar, activando } = usePushNotifications()

  if (estado === 'no-soportado') return null

  const Icon =
    estado === 'activadas' ? BellRing : estado === 'bloqueadas' ? BellOff : Bell

  function handleClick() {
    if (estado === 'bloqueadas') {
      toast.error(
        'Bloqueaste las notificaciones en el navegador. Tocá el candadito de la barra de direcciones → Notificaciones → Permitir, y probá de nuevo.',
        { duration: 9000 }
      )
      return
    }
    if (estado === 'activadas') {
      desactivar()
      return
    }
    activar()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={activando || estado === 'cargando'}
      title={
        estado === 'activadas'
          ? 'Notificaciones activadas en este navegador (clic para desactivar)'
          : estado === 'bloqueadas'
            ? 'Notificaciones bloqueadas en el navegador (clic para ver cómo permitirlas)'
            : 'Activar notificaciones de escritorio'
      }
      aria-label={
        estado === 'activadas'
          ? 'Desactivar notificaciones'
          : 'Activar notificaciones de escritorio'
      }
      className={cn(
        'hover:text-ink relative grid h-10 w-10 place-items-center rounded-full transition-colors disabled:opacity-50',
        estado === 'activadas' && 'text-success',
        estado === 'bloqueadas' && 'text-neifert',
        (estado === 'apagadas' || estado === 'cargando') && 'text-ink-3'
      )}
    >
      <Icon size={18} />
      {estado === 'activadas' && (
        <span
          className="bg-success absolute top-2 right-2 h-2 w-2 rounded-full"
          aria-hidden
        />
      )}
    </button>
  )
}
