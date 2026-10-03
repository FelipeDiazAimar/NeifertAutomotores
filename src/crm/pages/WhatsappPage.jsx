import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import Spinner from '@/components/common/Spinner'
import { tokenActual } from '@/crm/services/usuarios.service'
import { useUiStore } from '@/store/useUiStore'

// Dirección del servidor de WhatsApp.
const PANEL_URL = (import.meta.env.VITE_WHATSAPP_PANEL_URL || '').replace(/\/+$/, '')
const PANEL_ORIGEN = PANEL_URL ? new URL(PANEL_URL).origin : ''
// Si la sesión del panel vence, se recarga con un token nuevo; nunca más seguido que esto
// (evita un bucle si el servidor rechaza el token una y otra vez).
const RECARGA_MIN_MS = 30_000

/** Dirección del panel con el token del usuario logueado. El ?v= cambia en cada carga:
 *  así el iframe se recarga aunque el token sea el mismo. */
async function direccionConToken() {
  const token = await tokenActual()
  if (!token) throw new Error('Tu sesión del CRM venció. Volvé a iniciar sesión.')
  return `${PANEL_URL}/?v=${Date.now()}#t=${encodeURIComponent(token)}`
}

/**
 * El WhatsApp de la concesionaria dentro del CRM. El panel entra solo con el usuario
 * logueado: se le pasa el token de Supabase en la URL (#t=...) y el servidor lo canjea
 * por su propia sesión, con el nombre y el rol de ese usuario. No hay segundo login.
 */
export default function WhatsappPage() {
  const theme = useUiStore((s) => s.theme)
  const iframeRef = useRef(null)
  const ultimaCarga = useRef(0)
  const [src, setSrc] = useState('')
  const [listo, setListo] = useState(false)
  const [error, setError] = useState('')

  /** Carga (o recarga) el panel con un token recién pedido. */
  const cargar = useCallback(() => {
    ultimaCarga.current = Date.now()
    return direccionConToken().then(
      (url) => {
        setListo(false)
        setError('')
        setSrc(url)
      },
      (e) => setError(e.message),
    )
  }, [])

  useEffect(() => {
    if (PANEL_URL) cargar()
  }, [cargar])

  const enviarTema = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({ tipo: 'nf-wa:tema', tema: theme }, PANEL_ORIGEN)
  }, [theme])

  useEffect(enviarTema, [enviarTema])

  useEffect(() => {
    function alMensaje(e) {
      if (e.origin !== PANEL_ORIGEN || e.data?.origen !== 'nf-wa') return
      if (e.data.tipo === 'nf-wa:listo') {
        setListo(true)
        enviarTema()
      } else if (e.data.tipo === 'nf-wa:sin-sesion') {
        setListo(true)
        if (e.data.vencida && Date.now() - ultimaCarga.current > RECARGA_MIN_MS) cargar()
      }
    }
    window.addEventListener('message', alMensaje)
    return () => window.removeEventListener('message', alMensaje)
  }, [cargar, enviarTema])

  async function abrirEnPestana() {
    // La pestaña se abre ya, dentro del clic (si no, el navegador la bloquea); la
    // dirección se le pone cuando llega el token.
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
    }
  }

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
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold text-ink">WhatsApp</h1>
        <button
          onClick={abrirEnPestana}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink-3 transition-colors hover:text-ink"
        >
          <ExternalLink size={15} /> Abrir en otra pestaña
        </button>
      </div>

      {error && (
        <p className="rounded-2xl border border-neifert/40 bg-neifert/10 px-3 py-2 text-sm text-neifert">
          {error}
        </p>
      )}

      <div className="glass relative min-h-0 flex-1 overflow-hidden rounded-2xl">
        {!listo && !error && (
          <div className="absolute inset-0 grid place-items-center">
            <Spinner />
          </div>
        )}
        {src && (
          <iframe
            ref={iframeRef}
            src={src}
            title="WhatsApp de la concesionaria"
            // Micrófono para las notas de voz; clipboard para copiar mensajes.
            allow="microphone; clipboard-write"
            className="h-full w-full border-0"
            onLoad={enviarTema}
          />
        )}
      </div>
    </div>
  )
}
