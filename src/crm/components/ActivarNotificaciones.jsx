import { useState } from 'react'
import { Bell } from 'lucide-react'
import { toast } from 'sonner'
import { usePushNotifications } from '@/crm/hooks/usePushNotifications'
import { useAuth } from '@/hooks/useAuth'
import { obtenerMiPerfil } from '@/crm/services/crmUsuarios.service'
import { guardarMiEmail } from '@/crm/services/usuarios.service'
import Modal from '@/components/common/Modal'
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ActivarNotificaciones() {
  const { activar, activando, soportado } = usePushNotifications()
  const { session, isDemo } = useAuth()
  const [modal, setModal] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function handleClick() {
    // En demo no hay backend real: comportamiento anterior, sin chequeo.
    if (isDemo) return activar()
    const uid = session?.user?.id
    if (!uid) return toast.error('Iniciá sesión de nuevo para activar las notificaciones.')
    let perfil
    try {
      perfil = await obtenerMiPerfil(uid)
    } catch {
      return toast.error('No se pudo verificar tu email. Probá de nuevo.')
    }
    if (perfil?.email) return activar()
    setEmail('')
    setError('')
    setModal(true)
  }

  async function guardarYActivar(e) {
    e.preventDefault()
    const limpio = email.trim()
    if (!EMAIL_RE.test(limpio)) return setError('Ingresá un email válido.')
    setGuardando(true)
    try {
      await guardarMiEmail(limpio)
      setModal(false)
      await activar()
    } catch (err) {
      setError(err.message || 'No se pudo guardar el email.')
    } finally {
      setGuardando(false)
    }
  }

  if (!soportado) return null
  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={activando}
        title="Activar notificaciones de escritorio"
        aria-label="Activar notificaciones de escritorio"
        className="grid h-10 w-10 place-items-center rounded-full text-ink-3 transition-colors hover:text-ink disabled:opacity-50"
      >
        <Bell size={18} />
      </button>
      <Modal open={modal} onClose={() => setModal(false)} title="Tu email para las alertas">
        <p className="mb-4 text-sm text-ink-3">
          Todavía no tenés un email cargado. Lo usamos para avisarte por correo cuando una alerta
          esté por vencer, además de la notificación en pantalla.
        </p>
        <form onSubmit={guardarYActivar} className="space-y-3">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="empleado@neifertautomotores.com"
            error={error}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar y activar'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
