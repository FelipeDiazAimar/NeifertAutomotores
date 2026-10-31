import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { toast } from 'sonner'
import { esCampoDeTexto, insertarTexto } from '@/lib/dictado'
import { cn } from '@/lib/cn'

const MENSAJES_ERROR = {
  'not-allowed':
    'El navegador no tiene permiso para usar el micrófono. Tocá el candado de la barra de direcciones → Micrófono → Permitir.',
  'service-not-allowed':
    'El navegador no tiene permiso para usar el micrófono. Tocá el candado de la barra de direcciones → Micrófono → Permitir.',
  'audio-capture': 'No se detecta ningún micrófono conectado.',
  network: 'No hay conexión con el servicio de voz del navegador. Revisá internet.',
}

/** Dictado por voz para todo el CRM, independiente de Windows (Win+H): botón
 *  flotante o Ctrl+Shift+H. Escribe en el último campo de texto en el que se
 *  hizo clic. Usa el reconocimiento de voz de Chrome/Edge (necesita internet). */
export default function DictadoPorVoz() {
  const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null
  const campoRef = useRef(null)
  const recRef = useRef(null)
  const quieroRef = useRef(false)
  const [activo, setActivo] = useState(false)
  const [parcial, setParcial] = useState('')

  // Recuerda el último campo de texto enfocado: al tocar el botón el foco se
  // va, pero el dictado tiene que seguir yendo a ese campo.
  useEffect(() => {
    const alEnfocar = (e) => {
      if (esCampoDeTexto(e.target)) campoRef.current = e.target
    }
    document.addEventListener('focusin', alEnfocar)
    return () => document.removeEventListener('focusin', alEnfocar)
  }, [])

  const detener = useCallback(() => {
    quieroRef.current = false
    recRef.current?.stop()
    setActivo(false)
    setParcial('')
  }, [])

  const iniciar = useCallback(() => {
    const campo = campoRef.current
    if (!campo || !campo.isConnected) {
      toast.info('Hacé clic primero en el campo donde querés escribir y después activá el micrófono.')
      return
    }
    const rec = new SR()
    rec.lang = 'es-AR'
    rec.continuous = true
    rec.interimResults = true

    rec.onresult = (e) => {
      let interino = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const texto = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          const destino = campoRef.current
          if (destino?.isConnected && texto.trim()) insertarTexto(destino, texto.trim())
        } else {
          interino += texto
        }
      }
      setParcial(interino)
    }
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      quieroRef.current = false
      setActivo(false)
      setParcial('')
      toast.error(MENSAJES_ERROR[e.error] ?? `No se pudo usar el micrófono (${e.error}).`)
    }
    // Chrome corta solo tras un silencio: si seguimos dictando, se reabre.
    rec.onend = () => {
      if (quieroRef.current) {
        try {
          rec.start()
          return
        } catch {
          // ya estaba iniciado
        }
      }
      setActivo(false)
      setParcial('')
    }

    recRef.current = rec
    quieroRef.current = true
    try {
      rec.start()
      setActivo(true)
    } catch {
      quieroRef.current = false
    }
  }, [SR])

  const alternar = useCallback(() => (quieroRef.current ? detener() : iniciar()), [detener, iniciar])

  useEffect(() => {
    if (!SR) return
    const alTeclear = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        alternar()
      } else if (e.key === 'Escape' && quieroRef.current) {
        detener()
      }
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [SR, alternar, detener])

  // Al salir del CRM se apaga el micrófono.
  useEffect(() => () => {
    quieroRef.current = false
    recRef.current?.abort?.()
  }, [])

  if (!SR) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {activo && (
        <div className="glass max-w-[16rem] rounded-2xl px-3 py-2 text-xs text-ink shadow-glass" role="status">
          <span className="font-semibold text-neifert">Escuchando…</span>
          {parcial && <span className="ml-1 text-ink-2">{parcial}</span>}
        </div>
      )}
      <button
        type="button"
        // mousedown no le saca el foco al campo donde se está escribiendo
        onMouseDown={(e) => e.preventDefault()}
        onClick={alternar}
        aria-pressed={activo}
        aria-label={activo ? 'Detener dictado por voz' : 'Dictar por voz'}
        title={activo ? 'Detener (Esc)' : 'Dictar por voz (Ctrl+Shift+H)'}
        className={cn(
          'grid h-12 w-12 place-items-center rounded-full shadow-glass transition-colors',
          activo ? 'animate-pulse bg-neifert text-white' : 'glass text-ink-2 hover:text-neifert'
        )}
      >
        {activo ? <MicOff size={20} /> : <Mic size={20} />}
      </button>
    </div>
  )
}
