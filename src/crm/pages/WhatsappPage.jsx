import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import Spinner from '@/components/common/Spinner'
import { cn } from '@/lib/cn'
import { tokenActual } from '@/crm/services/usuarios.service'
import { useUiStore } from '@/store/useUiStore'

// Dirección del servidor de WhatsApp.
const PANEL_URL = (import.meta.env.VITE_WHATSAPP_PANEL_URL || '').replace(/\/+$/, '')
const PANEL_ORIGEN = PANEL_URL ? new URL(PANEL_URL).origin : ''
const REINTENTO_MS = 15_000
// Con la PC servidor apagada se abre una copia del panel que lee los chats guardados en la
// base (solo lectura; ver src/server/whatsappLectura.js). Es del mismo sitio que el CRM.
const LECTURA_URL = '/wa-lectura/index.html'
// Lo que puede tardar el panel en avisar que cargó (pide el token y lo canjea).
const ESPERA_PANEL_MS = 25_000

const VISTAS = [
  { id: 'inbox', label: 'Bandeja' },
  { id: 'connect', label: 'Conexión' },
]
// Mismos colores que el punto de estado del panel (clase que manda el panel).
const PUNTO = { '': 'bg-whatsapp', info: 'bg-sky-500', wait: 'bg-amber-500', off: 'bg-neifert' }

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

/** Logo de WhatsApp, en su verde. */
function WhatsappIcono({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="#25d366" aria-hidden="true" className={className}>
      <path d="M11.42 9.49c-.19-.09-1.1-.54-1.27-.61s-.29-.09-.42.1-.48.6-.59.73-.21.14-.4 0a5.13 5.13 0 0 1-1.49-.92 5.25 5.25 0 0 1-1-1.29c-.11-.18 0-.28.08-.38s.18-.21.28-.32a1.39 1.39 0 0 0 .18-.31.38.38 0 0 0 0-.33c0-.09-.42-1-.58-1.37s-.3-.32-.41-.32h-.4a.72.72 0 0 0-.5.23 2.1 2.1 0 0 0-.65 1.55A3.59 3.59 0 0 0 5 8.2 8.32 8.32 0 0 0 8.19 11c.44.19.78.3 1.05.39a2.53 2.53 0 0 0 1.17.07 1.93 1.93 0 0 0 1.26-.88 1.67 1.67 0 0 0 .11-.88c-.05-.07-.17-.12-.36-.21z" />
      <path d="M13.29 2.68A7.36 7.36 0 0 0 8 .5a7.44 7.44 0 0 0-6.41 11.15l-1 3.85 3.94-1a7.4 7.4 0 0 0 3.55.9H8a7.44 7.44 0 0 0 5.29-12.72zM8 14.12a6.12 6.12 0 0 1-3.15-.87l-.22-.13-2.34.61.62-2.28-.14-.23a6.18 6.18 0 0 1 9.6-7.65 6.12 6.12 0 0 1 1.81 4.37A6.19 6.19 0 0 1 8 14.12z" />
    </svg>
  )
}

/** "5493406518585" → "+54 9 3406518585" (celulares de Argentina); otro número, tal cual. */
const telefonoLegible = (t) => (/^549\d{10}$/.test(t || '') ? `+54 9 ${t.slice(3)}` : t || '')

/**
 * El WhatsApp de la concesionaria dentro del CRM. El panel entra solo con el usuario
 * logueado: cuando lo necesita, le pide al CRM el token de Supabase por mensaje entre
 * ventanas (nunca va en la dirección) y el servidor lo canjea por su propia sesión, con
 * el nombre y el rol de ese usuario. No hay segundo login.
 *
 * El encabezado (pestañas, estado de la línea y actualizar) es del CRM: el panel avisa
 * cómo está la línea y el CRM le pasa lo que se toca arriba. Así hay un solo encabezado y
 * el panel ocupa todo el espacio.
 */
export default function WhatsappPage() {
  const theme = useUiStore((s) => s.theme)
  const navigate = useNavigate()
  const iframeRef = useRef(null)
  // probando → (responde) panel | (no responde) caido
  const [servidor, setServidor] = useState('probando')
  const [listo, setListo] = useState(false)
  const [error, setError] = useState('')
  const [estado, setEstado] = useState(null) // lo que avisa el panel: conexión, teléfono, vista…

  // Cada intento (al entrar, con "Reintentar" o solo cada 15 s) pregunta si el servidor llega.
  const [intento, setIntento] = useState(0)
  const probar = useCallback(() => {
    setServidor('probando')
    setListo(false)
    setEstado(null)
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

  // Caído: se muestra el WhatsApp en solo lectura y se sigue probando en segundo plano (sin
  // cerrar lo que se está leyendo). Cuando la PC servidor vuelve, se pasa al panel normal.
  useEffect(() => {
    if (servidor !== 'caido') return undefined
    let vigente = true
    const t = setInterval(async () => {
      if ((await servidorResponde()) && vigente) probar()
    }, REINTENTO_MS)
    return () => {
      vigente = false
      clearInterval(t)
    }
  }, [servidor, probar])

  // A qué iframe se le habla: al panel de la PC servidor o a la copia de solo lectura.
  // (probar() ya deja listo y estado en cero cada vez que se cambia de uno a otro).
  const enLectura = servidor === 'caido'
  const origen = enLectura ? window.location.origin : PANEL_ORIGEN
  const origenRef = useRef(origen)
  // Antes de que el iframe nuevo pueda mandar nada: si no, su primer mensaje se descarta.
  useLayoutEffect(() => {
    origenRef.current = origen
  }, [origen])

  // El servidor respondió pero el panel nunca avisó que cargó (por ejemplo, la app se
  // reinició justo mientras se abría y el iframe quedó con la página de error): en vez de
  // quedar cargando para siempre, se vuelve a probar desde cero.
  useEffect(() => {
    if (servidor !== 'panel' || listo) return undefined
    const t = setTimeout(probar, ESPERA_PANEL_MS)
    return () => clearTimeout(t)
  }, [servidor, listo, probar])

  // Al panel solo se le habla cuando ya avisó que cargó: antes, adentro del iframe puede
  // haber otra cosa (una página de error) y el navegador rechaza el mensaje.
  const enviar = useCallback((datos) => {
    iframeRef.current?.contentWindow?.postMessage(datos, origenRef.current)
  }, [])

  useEffect(() => {
    if (listo) enviar({ tipo: 'nf-wa:tema', tema: theme })
  }, [listo, theme, enviar])

  useEffect(() => {
    async function alMensaje(e) {
      // Solo se habla con el panel, y solo con el que está en este iframe.
      if (e.origin !== origenRef.current || e.source !== iframeRef.current?.contentWindow || e.data?.origen !== 'nf-wa') return
      const { tipo } = e.data
      if (tipo === 'nf-wa:pedir-token') {
        const token = await tokenActual()
        if (!token) return setError('Tu sesión del CRM venció. Volvé a iniciar sesión.')
        enviar({ tipo: 'nf-wa:token', token })
      } else if (tipo === 'nf-wa:listo' || tipo === 'nf-wa:sin-sesion') {
        setListo(true)
        if (tipo === 'nf-wa:listo') setError('')
        else setEstado(null)
      } else if (tipo === 'nf-wa:estado') {
        setEstado(e.data)
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

  const enPanel = (servidor === 'panel' || enLectura) && listo && estado

  return (
    // Más ancho y alto que el resto de las páginas: el chat necesita todo el espacio.
    <div className="-mx-1 -mb-6 flex h-[calc(100dvh-5.75rem)] flex-col gap-3 md:-mx-3 md:mt-0.5 md:h-[calc(100dvh-2.125rem)]">
      {/* 40 px de alto y a 26 px del borde: queda centrado con el logo de Neifert de la barra lateral. */}
      <header className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="flex items-center gap-2 font-display text-xl font-bold text-ink">
          <WhatsappIcono className="h-6 w-6" />
          WhatsApp
        </h1>

        {enPanel && enLectura && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span
              className="glass flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold text-ink"
              title="La PC servidor está apagada: se ven los chats guardados. Se conecta sola cuando vuelva."
            >
              <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
              Solo lectura · servidor apagado
            </span>
            <button
              type="button"
              onClick={probar}
              className="glass flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold text-ink transition-colors hover:text-[#1a9e52] dark:hover:text-whatsapp"
              title="Probar ahora si la PC servidor ya está encendida"
            >
              <RefreshCw size={16} />
              Reintentar
            </button>
          </div>
        )}

        {enPanel && !enLectura && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Secciones del WhatsApp" className="glass flex rounded-full p-1">
              {VISTAS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={estado.vista === v.id}
                  disabled={v.id === 'inbox' && !estado.hayLinea}
                  title={v.id === 'inbox' && !estado.hayLinea ? 'Vinculá la línea para ver los chats' : undefined}
                  onClick={() => enviar({ tipo: 'nf-wa:vista', vista: v.id })}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                    estado.vista === v.id ? 'bg-ink text-surface-solid' : 'text-ink-2 hover:text-ink',
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => enviar({ tipo: 'nf-wa:vista', vista: 'connect' })}
              className="glass flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold text-ink"
              title="Ver la conexión de la línea"
            >
              <span className={cn('h-2 w-2 rounded-full', PUNTO[estado.clase] ?? PUNTO.info)} aria-hidden="true" />
              <span>{estado.texto}</span>
              {estado.telefono && <span className="font-normal tabular-nums text-ink-2">{telefonoLegible(estado.telefono)}</span>}
            </button>

            {estado.puedeActualizar && (
              <button
                type="button"
                onClick={() => enviar({ tipo: 'nf-wa:actualizar' })}
                disabled={!estado.actualizarHabilitado || estado.actualizando}
                title="Trae del celular los chats (archivados, fijados, silenciados) y los grupos"
                className="glass flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold text-ink transition-colors hover:text-[#1a9e52] disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-whatsapp"
              >
                <RefreshCw size={16} className={estado.actualizando ? 'animate-spin' : ''} />
                {estado.actualizando ? 'Recargando…' : 'Recargar'}
              </button>
            )}
          </div>
        )}
      </header>

      {error && (
        <p className="rounded-2xl border border-neifert/40 bg-neifert/10 px-3 py-2 text-sm text-neifert">
          {error}
        </p>
      )}

      <div className="relative min-h-0 flex-1">
        {servidor === 'caido' ? (
          // PC servidor apagada: el mismo panel, leyendo los chats guardados en la base.
          <>
            {!listo && !error && (
              <div className="absolute inset-0 grid place-items-center">
                <Spinner />
              </div>
            )}
            <iframe
              ref={iframeRef}
              src={LECTURA_URL}
              title="WhatsApp de la concesionaria (solo lectura)"
              allow="clipboard-write"
              className="h-full w-full border-0 bg-transparent"
            />
          </>
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
                className="h-full w-full border-0 bg-transparent"
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
