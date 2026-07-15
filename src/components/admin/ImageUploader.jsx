import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { UploadCloud, X, Star, Loader2 } from 'lucide-react'
import { uploadImageMedia } from '@/services/media.service'
import { IMAGE_RATIOS, MAX_IMAGE_MB } from '@/lib/mediaFormats'
import { cn } from '@/lib/cn'

/** Subida de imágenes (explorador / drag & drop / cámara en mobile).
 *  Comprime a WebP y valida formato antes de guardar.
 *  value: string[] · onChange: (urls) => void · La 1ª es la principal (★). */
export default function ImageUploader({ value = [], onChange, multiple = true }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState(null) // null | 0..1

  const addFiles = async (fileList) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    const toAdd = multiple ? files : files.slice(0, 1)

    const urls = []
    for (let i = 0; i < toAdd.length; i++) {
      try {
        setProgress(0)
        const res = await uploadImageMedia(toAdd[i], {
          onProgress: (p) => setProgress((i + p) / toAdd.length),
        })
        urls.push(res.url)
        if (res.warning) toast.warning(res.warning, { duration: 5000 })
      } catch (e) {
        toast.error(e.message || 'No se pudo subir la imagen')
      }
    }
    setProgress(null)
    if (urls.length) onChange(multiple ? [...value, ...urls] : [urls[0]])
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const removeAt = (i) => onChange(value.filter((_, idx) => idx !== i))
  const makeMain = (i) => onChange([value[i], ...value.filter((_, idx) => idx !== i)])

  const busy = progress != null

  return (
    <div>
      <div
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'relative flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors',
          dragging ? 'border-neifert bg-neifert/5' : 'border-glassborder hover:border-neifert/60',
          busy && 'pointer-events-none opacity-90'
        )}
      >
        {busy ? (
          <Loader2 size={26} className="animate-spin text-neifert" />
        ) : (
          <UploadCloud size={26} className="text-ink-3" />
        )}
        <p className="text-sm font-semibold text-ink">
          {busy ? `Procesando… ${Math.round(progress * 100)}%` : 'Arrastrá fotos o hacé clic'}
        </p>
        <p className="text-xs text-ink-3">
          JPG · PNG · WebP · hasta {MAX_IMAGE_MB}MB · {multiple ? 'varias' : 'una'}
        </p>
        <p className="text-[11px] text-ink-3">
          Formatos ideales: {IMAGE_RATIOS.map((r) => r.id).join(' · ')}
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
          type="file"
          accept="image/*"
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {value.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((url, i) => (
            <div
              key={i}
              className="group relative aspect-square overflow-hidden rounded-xl border border-glassborder"
            >
              <img src={url} alt="" className="h-full w-full object-cover" />
              {i === 0 && multiple && (
                <span className="absolute left-1 top-1 flex items-center gap-1 rounded-full bg-neifert px-1.5 py-0.5 text-[9px] font-bold text-white">
                  <Star size={9} fill="currentColor" /> Principal
                </span>
              )}
              <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                {i !== 0 && multiple && (
                  <button
                    type="button"
                    onClick={() => makeMain(i)}
                    title="Marcar como principal"
                    className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-[#0b0b0f] hover:bg-white"
                  >
                    <Star size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  title="Quitar"
                  className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-neifert hover:bg-white"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
