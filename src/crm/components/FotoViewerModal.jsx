import { useEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, RotateCcw, Download, Loader2 } from 'lucide-react'
import Modal from '@/components/common/Modal'
import { descargarImagen } from '@/crm/lib/descargarImagen'
import { cn } from '@/lib/cn'

const MIN = 0.5
const MAX = 4
const PASO = 0.25

const clamp = (z) => Math.min(MAX, Math.max(MIN, Math.round(z * 100) / 100))

export default function FotoViewerModal({ open, onClose, url, nombre }) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [rota, setRota] = useState(false)
  const [descargando, setDescargando] = useState(false)
  const arrastre = useRef(null)
  const zona = useRef(null)

  const [prevFoto, setPrevFoto] = useState(url)
  const fotoKey = open ? url : null
  if (fotoKey !== prevFoto) {
    setPrevFoto(fotoKey)
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setRota(false)
  }

  useEffect(() => {
    const el = zona.current
    if (!el || !open) return
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom((z) => clamp(z + (e.deltaY < 0 ? PASO : -PASO)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [open])

  function empezarPan(e) {
    if (zoom <= 1) return
    arrastre.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function moverPan(e) {
    if (!arrastre.current) return
    setPan({ x: e.clientX - arrastre.current.x, y: e.clientY - arrastre.current.y })
  }

  function terminarPan() {
    arrastre.current = null
  }

  function reset() {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  function toggle() {
    setPan({ x: 0, y: 0 })
    setZoom((z) => (z > 1 ? 1 : 2))
  }

  async function descargar() {
    if (!url || descargando) return
    setDescargando(true)
    try {
      await descargarImagen(url, nombre)
    } finally {
      setDescargando(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={nombre} size="xl">
      {url &&
        (rota ? (
          <p className="py-10 text-center text-sm text-ink-3">
            No se pudo cargar la imagen. Probá subirla de nuevo.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setZoom((z) => clamp(z - PASO))}
                aria-label="Reducir zoom"
                className="glass grid h-9 w-9 place-items-center rounded-xl text-ink transition-colors hover:border-ink/30"
              >
                <ZoomOut size={16} />
              </button>
              <span className="min-w-14 text-center text-sm font-semibold tabular-nums text-ink">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => clamp(z + PASO))}
                aria-label="Aumentar zoom"
                className="glass grid h-9 w-9 place-items-center rounded-xl text-ink transition-colors hover:border-ink/30"
              >
                <ZoomIn size={16} />
              </button>
              <button
                type="button"
                onClick={reset}
                aria-label="Restablecer zoom"
                className="glass grid h-9 w-9 place-items-center rounded-xl text-ink transition-colors hover:border-ink/30"
              >
                <RotateCcw size={16} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setPan({ x: 0, y: 0 })
                  setZoom(1)
                }}
                aria-label="Zoom 100%"
                className="glass h-9 rounded-xl px-3 text-sm font-semibold text-ink transition-colors hover:border-ink/30"
              >
                100%
              </button>
            </div>
            <div
              ref={zona}
              onDoubleClick={toggle}
              onPointerDown={empezarPan}
              onPointerMove={moverPan}
              onPointerUp={terminarPan}
              onPointerCancel={terminarPan}
              className="overflow-hidden rounded-2xl bg-black/5 touch-none select-none"
            >
              <img
                src={url}
                alt={nombre}
                draggable={false}
                onError={() => setRota(true)}
                style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)` }}
                className={cn(
                  'max-h-[70vh] w-full origin-center object-contain',
                  zoom > 1 ? 'cursor-grab active:cursor-grabbing' : '',
                )}
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={descargar}
                disabled={descargando}
                className="glass inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm font-semibold text-ink transition-colors hover:border-ink/30 disabled:opacity-60"
              >
                {descargando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                Descargar
              </button>
            </div>
          </div>
        ))}
    </Modal>
  )
}
