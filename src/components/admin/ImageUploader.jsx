import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Check, Loader2, RotateCw, Star, UploadCloud, X } from 'lucide-react'
import { uploadImageMedia } from '@/services/media.service'
import { MAX_IMAGE_MB, cropImageToSquare, rotateImageClockwise } from '@/lib/mediaFormats'
import { cn } from '@/lib/cn'

/** Carga fotos de vehículos: recorte 1:1 obligatorio y compresión WebP a 5 MB. */
export default function ImageUploader({ value = [], onChange, multiple = true }) {
  const inputRef = useRef(null)
  const dragRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState(null)
  const [cropQueue, setCropQueue] = useState([])
  const [crop, setCrop] = useState({ x: 0.5, y: 0.5, zoom: 1 })
  const [cropImageSize, setCropImageSize] = useState(null)
  const cropFile = cropQueue[0]
  const cropPreview = useMemo(() => (cropFile ? URL.createObjectURL(cropFile) : null), [cropFile])

  useEffect(() => () => cropPreview && URL.revokeObjectURL(cropPreview), [cropPreview])

  const addFiles = (fileList) => {
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'))
    if (!files.length) return toast.error('Seleccioná una imagen válida.')
    setCrop({ x: 0.5, y: 0.5, zoom: 1 })
    setCropImageSize(null)
    setCropQueue(multiple ? files : files.slice(0, 1))
  }

  const uploadFile = async (file) => {
    setProgress(0)
    try {
      const res = await uploadImageMedia(file, { onProgress: setProgress })
      onChange(multiple ? [...value, res.url] : [res.url])
      if (res.warning) toast.warning(res.warning, { duration: 5000 })
    } catch (error) {
      toast.error(error.message || 'No se pudo subir la imagen')
    } finally {
      setProgress(null)
    }
  }

  const confirmCrop = async () => {
    if (!cropFile) return
    try {
      const croppedFile = await cropImageToSquare(cropFile, crop)
      const remaining = cropQueue.slice(1)
      setCropQueue([])
      await uploadFile(croppedFile)
      if (remaining.length) {
        setCrop({ x: 0.5, y: 0.5, zoom: 1 })
        setCropImageSize(null)
        setCropQueue(remaining)
      }
    } catch (error) {
      toast.error(error.message || 'No se pudo recortar la imagen')
    }
  }

  const onDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    if (!progress) addFiles(event.dataTransfer.files)
  }

  const removeAt = (index) => onChange(value.filter((_, i) => i !== index))
  const makeMain = (index) => onChange([value[index], ...value.filter((_, i) => i !== index)])
  const busy = progress != null || Boolean(cropFile)

  const cropSide = 272
  const cropStage = 360
  const sourceSide = cropImageSize && Math.min(cropImageSize.width, cropImageSize.height) / crop.zoom
  const imageScale = sourceSide ? cropSide / sourceSide : 1
  const cropLeft = (cropStage - cropSide) / 2
  const cropTop = (cropStage - cropSide) / 2
  const sourceX = cropImageSize ? crop.x * (cropImageSize.width - sourceSide) : 0
  const sourceY = cropImageSize ? crop.y * (cropImageSize.height - sourceSide) : 0
  const imageStyle = cropImageSize ? { width: cropImageSize.width * imageScale, height: cropImageSize.height * imageScale, left: cropLeft - sourceX * imageScale, top: cropTop - sourceY * imageScale } : undefined

  const clampCrop = (value, zoom, dimension) => {
    if (!cropImageSize) return Math.max(0, Math.min(1, value))
    const side = Math.min(cropImageSize.width, cropImageSize.height) / zoom
    return side >= dimension ? 0.5 : Math.max(0, Math.min(1, value))
  }

  const startDrag = (event) => {
    if (!cropImageSize) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
  }

  const moveDrag = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || !cropImageSize) return
    const scale = cropSide / (Math.min(cropImageSize.width, cropImageSize.height) / crop.zoom)
    const dx = (event.clientX - drag.x) / scale
    const dy = (event.clientY - drag.y) / scale
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY }
    setCrop((state) => {
      const side = Math.min(cropImageSize.width, cropImageSize.height) / state.zoom
      return { ...state, x: clampCrop(state.x - dx / Math.max(1, cropImageSize.width - side), state.zoom, cropImageSize.width), y: clampCrop(state.y - dy / Math.max(1, cropImageSize.height - side), state.zoom, cropImageSize.height) }
    })
  }

  const rotateCropImage = async () => {
    if (!cropFile) return
    try {
      const rotated = await rotateImageClockwise(cropFile)
      setCrop({ x: 0.5, y: 0.5, zoom: 1 })
      setCropImageSize(null)
      setCropQueue((queue) => [rotated, ...queue.slice(1)])
    } catch (error) {
      toast.error(error.message || 'No se pudo rotar la imagen')
    }
  }

  const cancelCrop = () => {
    dragRef.current = null
    setCropQueue([])
    setCropImageSize(null)
  }

  return (
    <div>
      <div onClick={() => !busy && inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop} className={cn('relative flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors', dragging ? 'border-neifert bg-neifert/5' : 'border-glassborder hover:border-neifert/60', busy && 'pointer-events-none opacity-90')}>
        {progress != null ? <Loader2 size={26} className="animate-spin text-neifert" /> : <UploadCloud size={26} className="text-ink-3" />}
        <p className="text-sm font-semibold text-ink">{progress != null ? `Procesando… ${Math.round(progress * 100)}%` : 'Arrastrá fotos o hacé clic'}</p>
        <p className="text-xs text-ink-3">JPG · PNG · WebP · resultado de hasta {MAX_IMAGE_MB}MB · {multiple ? 'varias' : 'una'}</p>
        <p className="text-[11px] text-ink-3">Se recortan obligatoriamente en formato cuadrado 1:1</p>
        {progress != null && <div className="absolute inset-x-0 bottom-0 h-1 bg-line"><div className="h-full bg-neifert transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
        <input ref={inputRef} type="file" accept="image/*" multiple={multiple} className="hidden" onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} />
      </div>

      {cropFile && createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(event) => { event.stopPropagation(); cancelCrop() }}>
        <div className="w-full max-w-md rounded-2xl border border-neifert bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <h3 className="text-base font-bold text-ink">Recortá la foto</h3>
          <p className="mt-1 text-sm text-ink-3">Arrastrá la foto para encuadrarla. Usá los controles para el zoom y la rotación.</p>
          <div className="relative mx-auto mt-4 h-[360px] w-full max-w-[360px] touch-none overflow-hidden rounded-xl bg-black/80 cursor-grab active:cursor-grabbing" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { dragRef.current = null }} onPointerCancel={() => { dragRef.current = null }}>
            <img src={cropPreview} alt="Imagen para recortar" draggable="false" onLoad={(event) => setCropImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} className="absolute max-w-none select-none opacity-40" style={imageStyle} />
            {cropImageSize && <div className="absolute overflow-hidden border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.25)]" style={{ left: cropLeft, top: cropTop, width: cropSide, height: cropSide }}>
              <img src={cropPreview} alt="Vista previa del recorte" draggable="false" className="absolute max-w-none select-none" style={{ ...imageStyle, left: -sourceX * imageScale, top: -sourceY * imageScale }} />
            </div>}
            <div className="pointer-events-none absolute inset-0 rounded-xl border border-white/20" />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <label className="flex flex-1 items-center gap-3 text-xs font-medium text-ink-3">Zoom <input className="flex-1 accent-neifert" type="range" min="1" max="3" step="0.05" value={crop.zoom} onChange={(event) => setCrop((state) => ({ ...state, zoom: Number(event.target.value) }))} /></label>
            <button type="button" onClick={rotateCropImage} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold text-ink transition-colors hover:border-neifert hover:text-neifert" title="Rotar 90°"><RotateCw size={15} /> Rotar</button>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="rounded-lg px-3 py-2 text-sm text-ink-3" onClick={cancelCrop}>Cancelar</button>
            <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-neifert px-3 py-2 text-sm font-semibold text-white" onClick={confirmCrop}><Check size={16} /> Usar recorte</button>
          </div>
        </div>
      </div>, document.body)}

      {value.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((url, index) => <div key={url} className="group relative aspect-square overflow-hidden rounded-xl border border-glassborder">
          <img src={url} alt="" className="h-full w-full object-cover" />
          {index === 0 && multiple && <span className="absolute left-1 top-1 flex items-center gap-1 rounded-full bg-neifert px-1.5 py-0.5 text-[9px] font-bold text-white"><Star size={9} fill="currentColor" /> Principal</span>}
          <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            {index !== 0 && multiple && <button type="button" onClick={() => makeMain(index)} title="Marcar como principal" className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-[#0b0b0f] hover:bg-white"><Star size={14} /></button>}
            <button type="button" onClick={() => removeAt(index)} title="Quitar" className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-neifert hover:bg-white"><X size={14} /></button>
          </div>
        </div>)}
      </div>}
    </div>
  )
}
