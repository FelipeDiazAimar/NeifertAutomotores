import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Check, RotateCw, Loader2 } from 'lucide-react'
import { cropImage, rotateImageClockwise } from '@/lib/mediaFormats'

const DEFAULT_STAGE = { w: 540, h: 340 }
const CROP_MARGIN = 0.88

export default function ImageCropper({ file, aspectRatio = { w: 1, h: 1 }, aspectOptions = null, onConfirm, onCancel }) {
  const dragRef = useRef(null)
  const urlRef = useRef(null)
  const stageRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [activeFile, setActiveFile] = useState(null)
  const [crop, setCrop] = useState({ x: 0.5, y: 0.5, zoom: 1 })
  const [imageSize, setImageSize] = useState(null)
  const [stage, setStage] = useState(DEFAULT_STAGE)
  const [working, setWorking] = useState(false)
  const [aspect, setAspect] = useState(aspectOptions?.[0] || aspectRatio)

  const chooseAspect = (option) => {
    setAspect(option)
    setCrop({ x: 0.5, y: 0.5, zoom: 1 })
  }

  useEffect(() => {
    const next = file || null
    setActiveFile(next)
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
    if (next) { urlRef.current = URL.createObjectURL(next); setPreview(urlRef.current) }
    else setPreview(null)
    return () => { if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null } }
  }, [file])

  useEffect(() => {
    const element = stageRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width && height) setStage({ w: width, h: height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const { w: aW, h: aH } = aspect
  const cropRatio = aW / aH

  // Crop area dimensions (centered within the stage)
  const cropArea = useMemo(() => {
    const stageRatio = stage.w / stage.h
    let w, h
    if (cropRatio >= stageRatio) {
      w = stage.w * CROP_MARGIN
      h = w / cropRatio
    } else {
      h = stage.h * CROP_MARGIN
      w = h * cropRatio
    }
    return {
      w, h,
      left: (stage.w - w) / 2,
      top: (stage.h - h) / 2,
    }
  }, [cropRatio, stage])

  // Source region in image pixels for the given zoom
  const sourceSize = useMemo(() => {
    if (!imageSize) return null
    const imageRatio = imageSize.width / imageSize.height
    if (cropRatio >= imageRatio) {
      const w = imageSize.width / crop.zoom
      return { w, h: w / cropRatio }
    } else {
      const h = imageSize.height / crop.zoom
      return { w: h * cropRatio, h }
    }
  }, [imageSize, crop.zoom, cropRatio])

  const scale = sourceSize ? cropArea.w / sourceSize.w : 1
  const sourceX = imageSize && sourceSize ? crop.x * (imageSize.width - sourceSize.w) : 0
  const sourceY = imageSize && sourceSize ? crop.y * (imageSize.height - sourceSize.h) : 0

  const imageStyle = imageSize && sourceSize
    ? {
        width: imageSize.width * scale,
        height: imageSize.height * scale,
        left: cropArea.left - sourceX * scale,
        top: cropArea.top - sourceY * scale,
      }
    : undefined

  const clamp = (value, imgDim, sourceDim) => {
    if (!imageSize) return Math.max(0, Math.min(1, value))
    return sourceDim >= imgDim ? 0.5 : Math.max(0, Math.min(1, value))
  }

  const startDrag = (e) => {
    if (!imageSize) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY }
  }

  const moveDrag = (e) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId || !sourceSize || !imageSize) return
    const dragScale = cropArea.w / sourceSize.w
    const dx = (e.clientX - drag.x) / dragScale
    const dy = (e.clientY - drag.y) / dragScale
    dragRef.current = { ...drag, x: e.clientX, y: e.clientY }
    setCrop((s) => ({
      ...s,
      x: clamp(s.x - dx / Math.max(1, imageSize.width - sourceSize.w), imageSize.width, sourceSize.w),
      y: clamp(s.y - dy / Math.max(1, imageSize.height - sourceSize.h), imageSize.height, sourceSize.h),
    }))
  }

  const endDrag = () => { dragRef.current = null }

  const rotate = async () => {
    try {
      const target = activeFile || file
      const rotated = await rotateImageClockwise(target)
      const newUrl = URL.createObjectURL(rotated)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = newUrl
      setPreview(newUrl)
      setActiveFile(rotated)
      setCrop({ x: 0.5, y: 0.5, zoom: 1 })
      setImageSize(null)
    } catch (error) {
      toast.error(error.message || 'No se pudo rotar la imagen')
    }
  }

  const confirm = async () => {
    if (working) return
    setWorking(true)
    const target = activeFile || file
    console.log('[IMG] cropper.confirm: recortando', {
      name: target?.name,
      type: target?.type || '(vacío)',
      sizeMB: target ? +(target.size / 1048576).toFixed(2) : null,
      crop,
      aspect: `${aW}:${aH}`,
    })
    try {
      const cropped = await cropImage(target, {
        x: crop.x, y: crop.y, zoom: crop.zoom,
        aspectW: aW, aspectH: aH,
      })
      console.log('[IMG] cropper.confirm: recorte OK', {
        name: cropped.name,
        type: cropped.type,
        sizeMB: +(cropped.size / 1048576).toFixed(2),
      })
      onConfirm(cropped)
    } catch (error) {
      console.error('[IMG] cropper.confirm: ERROR recortando', error?.message, error)
      toast.error(error.message || 'No se pudo recortar la imagen')
      setWorking(false)
    }
  }

  const handleCancel = () => { dragRef.current = null; onCancel() }

  const ratioLabel = `${aW}:${aH}`

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4" onClick={handleCancel}>
      <div
        className="my-auto w-full max-w-[640px] rounded-2xl border border-neifert bg-surface-solid p-4 shadow-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-ink">Recortá la imagen</h3>
        <p className="mt-1 text-sm text-ink-3">
          Arrastrá para encuadrar. Relación de aspecto {ratioLabel}.
        </p>

        {aspectOptions && aspectOptions.length > 1 && (
          <div className="mt-3 flex justify-center">
            <div className="inline-flex items-center gap-1 rounded-full border border-line bg-black/5 p-1">
              {aspectOptions.map((option) => {
                const active = option.w === aW && option.h === aH
                return (
                  <button
                    key={option.label}
                    type="button"
                    disabled={working}
                    onClick={() => chooseAspect(option)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      active ? 'bg-neifert text-white shadow' : 'text-ink-3 hover:text-ink'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Stage */}
        <div
          ref={stageRef}
          className="relative mx-auto mt-4 aspect-[27/17] w-full max-w-[540px] touch-none overflow-hidden rounded-xl bg-black/90 cursor-grab active:cursor-grabbing"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {preview && (
            <img
              src={preview}
              alt=""
              draggable="false"
              onLoad={(e) => {
                console.log('[IMG] cropper.preview: imagen cargada', {
                  w: e.currentTarget.naturalWidth,
                  h: e.currentTarget.naturalHeight,
                })
                setImageSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
              }}
              onError={(e) => console.error('[IMG] cropper.preview: NO se pudo mostrar la imagen (formato no soportado por el navegador?)', e?.type)}
              className="pointer-events-none absolute max-w-none select-none"
              style={imageStyle}
            />
          )}

          {/* Top overlay */}
          <div className="pointer-events-none absolute bg-black/55" style={{ top: 0, left: 0, right: 0, height: cropArea.top }} />
          {/* Bottom overlay */}
          <div className="pointer-events-none absolute bg-black/55" style={{ bottom: 0, left: 0, right: 0, height: stage.h - cropArea.top - cropArea.h }} />
          {/* Left overlay */}
          <div className="pointer-events-none absolute bg-black/55" style={{ top: cropArea.top, left: 0, width: cropArea.left, height: cropArea.h }} />
          {/* Right overlay */}
          <div className="pointer-events-none absolute bg-black/55" style={{ top: cropArea.top, right: 0, width: stage.w - cropArea.left - cropArea.w, height: cropArea.h }} />

          {/* Crop area border */}
          {imageSize && (
            <div
              className="pointer-events-none absolute overflow-hidden border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.25)]"
              style={{ left: cropArea.left, top: cropArea.top, width: cropArea.w, height: cropArea.h }}
            />
          )}

          <div className="pointer-events-none absolute inset-0 rounded-xl border border-white/20" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex min-w-0 flex-1 items-center gap-3 text-xs font-medium text-ink-3">
            Zoom
            <input
              className="flex-1 accent-neifert"
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={crop.zoom}
              onChange={(e) => setCrop((s) => ({ ...s, zoom: Number(e.target.value) }))}
            />
          </label>
          <button
            type="button"
            onClick={rotate}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold text-ink transition-colors hover:border-neifert hover:text-neifert"
            title="Rotar 90°"
          >
            <RotateCw size={15} /> Rotar
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={working} className="rounded-lg px-3 py-2 text-sm text-ink-3 disabled:opacity-50" onClick={handleCancel}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={working}
            className="inline-flex items-center gap-1 rounded-lg bg-neifert px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
            onClick={confirm}
          >
            {working ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {working ? 'Procesando…' : 'Usar recorte'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
