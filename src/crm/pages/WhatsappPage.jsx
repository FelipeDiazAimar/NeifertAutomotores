import { useState } from 'react'
import { MessageCircle, ExternalLink } from 'lucide-react'
import Button from '@/components/common/Button'
import GlassCard from '@/components/common/GlassCard'
import { tokenActual } from '@/crm/services/usuarios.service'

// Dirección del servidor de WhatsApp.
const PANEL_URL = (import.meta.env.VITE_WHATSAPP_PANEL_URL || '').replace(/\/+$/, '')

/**
 * Abre el panel de WhatsApp con la sesión del CRM: le pasa el token en la URL y el
 * servidor lo canjea por su propia sesión. Así no hay un segundo login.
 * Se abre desde un botón (y no solo al entrar) porque el navegador bloquea las
 * pestañas nuevas que no salen de un clic.
 */
export default function WhatsappPage() {
  const [error, setError] = useState('')
  const [abriendo, setAbriendo] = useState(false)

  async function abrir() {
    setError('')
    setAbriendo(true)
    // La pestaña se abre ya, dentro del clic; la dirección se le pone cuando llega el token.
    const ventana = window.open('', '_blank')
    try {
      const token = await tokenActual()
      if (!token) throw new Error('Tu sesión del CRM venció. Volvé a iniciar sesión.')
      const url = `${PANEL_URL}/#t=${encodeURIComponent(token)}`
      if (ventana) {
        ventana.opener = null
        ventana.location.href = url
      } else {
        window.location.href = url
      }
    } catch (e) {
      ventana?.close()
      setError(e.message)
    } finally {
      setAbriendo(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-xl font-bold text-ink">WhatsApp</h1>
      <GlassCard className="mt-6 space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-600">
            <MessageCircle size={22} />
          </span>
          <div>
            <p className="font-semibold text-ink">Bandeja de la concesionaria</p>
            <p className="text-sm text-ink-3">Se abre en otra pestaña con tu usuario del CRM.</p>
          </div>
        </div>

        {!PANEL_URL ? (
          <p className="rounded-2xl border border-neifert/40 bg-neifert/10 px-3 py-2 text-sm text-neifert">
            Falta configurar la dirección del servidor de WhatsApp (VITE_WHATSAPP_PANEL_URL).
          </p>
        ) : (
          <Button onClick={abrir} disabled={abriendo} className="w-full">
            <ExternalLink size={16} /> {abriendo ? 'Abriendo…' : 'Abrir WhatsApp'}
          </Button>
        )}

        {error && (
          <p className="rounded-2xl border border-neifert/40 bg-neifert/10 px-3 py-2 text-sm text-neifert">{error}</p>
        )}
      </GlassCard>
    </div>
  )
}
