import { useLayoutEffect, useRef, useState } from 'react'
import { Maximize2, Minus, Plus, Scan } from 'lucide-react'
import { toast } from 'sonner'
import PresupuestoVehiculo from './PresupuestoVehiculo'

const BASE_ANCHO = 1080
const ZOOM_MIN = 0.3
const ZOOM_MAX = 3
const ZOOM_PASO = 0.25

/** Escala base para que el presupuesto entre entero (ancho y alto visibles). */
function useEscalaAjustada(areaRef, nodoRef, zoom) {
  const [base, setBase] = useState(1)
  const [alto, setAlto] = useState(undefined)
  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    const medir = () => {
      const nodo = nodoRef.current
      const h = nodo?.offsetHeight || 1600
      if (el.clientWidth === 0 || el.clientHeight === 0) return
      const s = Math.min(el.clientWidth / BASE_ANCHO, el.clientHeight / h)
      setBase(s)
      if (nodo) setAlto(nodo.offsetHeight * s * zoom)
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    if (nodoRef.current) ro.observe(nodoRef.current)
    window.addEventListener('resize', medir)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', medir)
    }
  }, [areaRef, nodoRef, zoom])
  return { base, alto }
}

function ZoomBtn({ label, onClick, children, disabled }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-xl text-ink-2 transition-colors hover:bg-surface hover:text-ink disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}

/** Vista previa: entra entera sin scroll, con zoom (+/−/ajustar) y pantalla completa. */
export default function PresupuestoPreview({ datos, nodoRef }) {
  const marcoRef = useRef(null)
  const areaRef = useRef(null)
  const [zoom, setZoom] = useState(1)
  const { base, alto } = useEscalaAjustada(areaRef, nodoRef, zoom)
  const escala = base * zoom

  function pantallaCompleta() {
    const el = marcoRef.current
    if (el?.requestFullscreen) {
      el.requestFullscreen().catch(() => toast.error('No se pudo abrir en pantalla completa.'))
    } else {
      toast.error('Tu navegador no soporta pantalla completa.')
    }
  }

  return (
    <div ref={marcoRef} className="overflow-hidden rounded-2xl bg-black/70">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <ZoomBtn label="Reducir zoom" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_PASO).toFixed(2)))} disabled={zoom <= ZOOM_MIN}>
          <Minus size={16} />
        </ZoomBtn>
        <span aria-live="polite" className="min-w-12 text-center text-xs font-semibold text-ink-2">
          {Math.round(zoom * 100)}%
        </span>
        <ZoomBtn label="Ampliar zoom" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_PASO).toFixed(2)))} disabled={zoom >= ZOOM_MAX}>
          <Plus size={16} />
        </ZoomBtn>
        <ZoomBtn label="Ajustar a pantalla" onClick={() => setZoom(1)} disabled={zoom === 1}>
          <Scan size={16} />
        </ZoomBtn>
        <div className="flex-1" />
        <ZoomBtn label="Pantalla completa" onClick={pantallaCompleta}>
          <Maximize2 size={16} />
        </ZoomBtn>
      </div>
      <div
        ref={areaRef}
        data-lenis-prevent
        className="grid place-items-center overflow-auto p-3"
        style={{ maxHeight: '68vh' }}
      >
        <div style={{ width: BASE_ANCHO * escala, height: alto, overflow: 'hidden' }}>
          <div style={{ transform: `scale(${escala})`, transformOrigin: 'top left', width: BASE_ANCHO }}>
            <PresupuestoVehiculo datos={datos} nodoRef={nodoRef} />
          </div>
        </div>
      </div>
    </div>
  )
}
