import { useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { UploadCloud, X, Loader2 } from 'lucide-react'
import { uploadVideoMedia } from '@/services/media.service'
import { VIDEO_RATIOS, MAX_VIDEO_MB } from '@/lib/mediaFormats'
import { cn } from '@/lib/cn'

/** Subida de un video (explorador / drag & drop). Valida formato/peso,
 *  detecta relación de aspecto y avisa. value: string · onChange: (url) => void */
export default function VideoUploader({ value, onChange, maxSizeMB, aspectRatio }) {
  const inputRef = useRef(null)
  const inputId = useId()
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState(null)

  const remove = () => onChange('')

  const addFile = async (file) => {
    if (!file) return
    try {
      setProgress(0)
      const res = await uploadVideoMedia(file, { onProgress: setProgress, maxSizeMB })
      onChange(res.url)
      if (res.warning) toast.warning(res.warning, { duration: 6000 })
    } catch (e) {
      toast.error(e.message || 'No se pudo subir el video')
    } finally {
      setProgress(null)
    }
  }

  if (value) {
    const vid = (
      <video src={value} className="h-full w-full bg-black object-cover" controls muted playsInline />
    )
    return aspectRatio ? (
      <div className="relative mx-auto w-full max-w-[200px] overflow-hidden rounded-2xl border border-glassborder">
        <div className="relative mx-auto" style={{ aspectRatio: `${aspectRatio.w}/${aspectRatio.h}` }}>
          {vid}
        </div>
        <button
          type="button"
          onClick={remove}
          aria-label="Quitar video"
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-neifert hover:bg-white"
        >
          <X size={15} />
        </button>
      </div>
    ) : (
      <div className="relative overflow-hidden rounded-2xl border border-glassborder">
        <div className="h-40 w-full bg-black">{vid}</div>
        <button
          type="button"
          onClick={remove}
          aria-label="Quitar video"
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-neifert hover:bg-white"
        >
          <X size={15} />
        </button>
      </div>
    )
  }

  const busy = progress != null

  return (
    // <label htmlFor> en vez de un div + ref.click(): ver comentario en
    // ImageUploader.jsx — el patrón .click() programático hacía que iOS
    // nunca disparara "change" después de elegir el archivo.
    <label
      htmlFor={inputId}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        addFile(e.dataTransfer.files?.[0])
      }}
      className={cn(
        'relative flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors',
        dragging ? 'border-neifert bg-neifert/5' : 'border-glassborder hover:border-neifert/60',
        busy && 'pointer-events-none opacity-90'
      )}
    >
      {busy ? (
        <Loader2 size={24} className="animate-spin text-neifert" />
      ) : (
        <UploadCloud size={24} className="text-ink-3" />
      )}
      <p className="text-sm font-semibold text-ink">
        {!busy
          ? 'Arrastrá un video o hacé clic'
          : progress < 0.05
            ? 'Procesando video…'
            : `Subiendo… ${Math.round(progress * 100)}%`}
      </p>
      <p className="text-xs text-ink-3">
        MP4 · WebM · MOV · hasta {maxSizeMB || MAX_VIDEO_MB}MB
      </p>
      <p className="text-[11px] text-ink-3">
        Formatos ideales: {VIDEO_RATIOS.map((r) => r.id).join(' · ')}
      </p>

      {busy && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-line">
          <div
            className="h-full bg-neifert transition-[width] duration-200"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="video/*"
        className="sr-only"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          addFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </label>
  )
}
