import { Bell } from 'lucide-react'
import { usePushNotifications } from '@/crm/hooks/usePushNotifications'

export default function ActivarNotificaciones() {
  const { activar, activando, soportado } = usePushNotifications()
  if (!soportado) return null
  return (
    <button
      type="button"
      onClick={activar}
      disabled={activando}
      title="Activar notificaciones de escritorio"
      aria-label="Activar notificaciones de escritorio"
      className="grid h-10 w-10 place-items-center rounded-full text-ink-3 transition-colors hover:text-ink disabled:opacity-50"
    >
      <Bell size={18} />
    </button>
  )
}
