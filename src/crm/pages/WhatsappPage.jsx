import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Spinner from '@/components/common/Spinner'
import { tokenActual } from '@/crm/services/usuarios.service'
import { useUiStore } from '@/store/useUiStore'

// Dirección del servidor de WhatsApp.
const PANEL_URL = (import.meta.env.VITE_WHATSAPP_PANEL_URL || '').replace(/\/+$/, '')
const PANEL_ORIGEN = PANEL_URL ? new URL(PANEL_URL).origin : ''
const REINTENTO_MS = 15_000

/**
 * ¿Responde el servidor de WhatsApp? Se pregunta sin leer la respuesta (no-cors): alcanza
 * con saber si llega. Si la PC servidor está apagada o la app cerrada, falla la conexión.
 */
async function servidorResponde() {
  try {
    await fetch(`${PANEL_URL}/api/salud`, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(6000) })
    return true
  } catch {
    return false
  }
}

/**
 * El WhatsApp de la concesionaria dentro del CRM. El panel entra solo con el usuario
 * logueado: cuando lo necesita, le pide al CRM el token de Supabase por mensaje entre
 * ventanas (nunca va en la dirección) y el servidor lo canjea por su propia sesión, con
 * el nombre y el rol de ese usuario. No hay segundo login.
 */
export default function WhatsappPage() {
  const theme = useUiStore((s) => s.theme)
  const navigate = useNavigate()
  const iframeRef = useRef(null)
  // probando → (responde) panel | (no responde) caido
  const [servidor, setServidor] = useState('probando')
  const [listo, setListo] = useState(false)
  const [error, setError] = useState('')

  // Cada intento (al entrar, con "Reintentar" o solo cada 15 s) pregunta si el servidor llega.
  const [intento, setIntento] = useState(0)
  const probar = useCallback(() => {
    setServidor('probando')
    setListo(false)
    setIntento((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!PANEL_URL) return undefined
    let vigente = true
    servidorResponde().then((ok) => {
      if (vigente) setServidor(ok ? 'panel' : 'caido')
    })
    return () => {
      vigente = false
    }
  }, [intento])

  // Caído: se vuelve a probar solo cada tanto (la PC servidor puede estar arrancando).
  useEffect(() => {
    if (servidor !== 'caido') return undefined
    const t = setTimeout(probar, REINTENTO_MS)
    return () => clearTimeout(t)
  }, [servidor, probar])

  // Al panel solo se le habla cuando ya avisó que cargó: antes, adentro del iframe puede
  // haber otra cosa (una página de error) y el navegador rechaza el mensaje.
  const enviar = useCallback((datos) => {
    iframeRef.current?.contentWindow?.postMessage(datos, PANEL_ORIGEN)
  }, [])

  useEffect(() => {
    if (listo) enviar({ tipo: 'nf-wa:tema', tema: theme })
  }, [listo, theme, enviar])

  useEffect(() => {
    async function alMensaje(e) {
      // Solo se habla con el panel, y solo con el que está en este iframe.
      if (e.origin !== PANEL_ORIGEN || e.source !== iframeRef.current?.contentWindow || e.data?.origen !== 'nf-wa') return
      const { tipo } = e.data
      if (tipo === 'nf-wa:pedir-token') {
        const token = await tokenActual()
        if (!token) return setError('Tu sesión del CRM venció. Volvé a iniciar sesión.')
        enviar({ tipo: 'nf-wa:token', token })
      } else if (tipo === 'nf-wa:listo' || tipo === 'nf-wa:sin-sesion') {
        setListo(true)
        if (tipo === 'nf-wa:listo') setError('')
      } else if (tipo === 'nf-wa:abrir' && typeof e.data.ruta === 'string' && /^\/crm\//.test(e.data.ruta)) {
        // "Ver ficha" en el panel: abre la pantalla del CRM (solo rutas del CRM).
        navigate(e.data.ruta)
      }
    }
    window.addEventListener('message', alMensaje)
    return () => window.removeEventListener('message', alMensaje)
  }, [enviar, navigate])

  if (!PANEL_URL) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="font-display text-xl font-bold text-ink">WhatsApp</h1>
        <p className="mt-6 rounded-2xl border border-neifert/40 bg-neifert/10 px-3 py-2 text-sm text-neifert">
          Falta configurar la dirección del servidor de WhatsApp (VITE_WHATSAPP_PANEL_URL).
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col gap-3 md:h-[calc(100dvh-3.5rem)]">
      <h1 className="font-display text-xl font-bold text-ink">WhatsApp</h1>

      {error && (
        <p className="rounded-2xl border border-neifert/40 bg-neifert/10 px-3 py-2 text-sm text-neifert">
          {error}
        </p>
      )}

      <div className="glass relative min-h-0 flex-1 overflow-hidden rounded-2xl">
        {servidor === 'caido' ? (
          <div className="grid h-full place-items-center p-6">
            <div className="max-w-sm text-center">
              <p className="font-display text-lg font-bold text-ink">El servidor de WhatsApp no responde</p>
              <p className="mt-2 text-sm text-ink-2">
                La PC que hace de servidor está apagada, sin internet, o la app &quot;Neifert WhatsApp&quot; está cerrada o con el
                servidor detenido. Se vuelve a intentar solo.
              </p>
              <button
                type="button"
                onClick={probar}
                className="mt-4 rounded-xl bg-neifert px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
              >
                Reintentar ahora
              </button>
            </div>
          </div>
        ) : (
          <>
            {(servidor === 'probando' || (!listo && !error)) && (
              <div className="absolute inset-0 grid place-items-center">
                <Spinner />
              </div>
            )}
            {servidor === 'panel' && (
              <iframe
                ref={iframeRef}
                src={`${PANEL_URL}/`}
                title="WhatsApp de la concesionaria"
                // Micrófono para las notas de voz; clipboard para copiar mensajes.
                allow="microphone; clipboard-write"
                className="h-full w-full border-0"
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
