import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Star, UploadCloud, X } from 'lucide-react'
import { uploadImageMedia } from '@/services/media.service'
import { MAX_IMAGE_MB } from '@/lib/mediaFormats'
import { cn } from '@/lib/cn'
import ImageCropper from './ImageCropper'

const DEFAULT_ASPECT = { w: 1, h: 1 }

export default function ImageUploader({ value = [], onChange, multiple = true, aspectRatio = DEFAULT_ASPECT, maxSizeMB = MAX_IMAGE_MB }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState(null)
  const [cropQueue, setCropQueue] = useState([])
  const cropFile = cropQueue[0]
  const { w: aW, h: aH } = aspectRatio

  const addFiles = (fileList) => {
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'))
    if (!files.length) return toast.error('Seleccioná una imagen válida.')
    setCropQueue(multiple ? files : files.slice(0, 1))
  }

  const uploadFile = async (file) => {
    setProgress(0)
    try {
      const res = await uploadImageMedia(file, {
        onProgress: setProgress,
        maxSizeMB,
        skipRatioCheck: aW !== 1 || aH !== 1,
      })
      onChange(multiple ? [...value, res.url] : [res.url])
      if (res.warning) toast.warning(res.warning, { duration: 5000 })
    } catch (error) {
      toast.error(error.message || 'No se pudo subir la imagen')
    } finally {
      setProgress(null)
    }
  }

  const confirmCrop = async (croppedFile) => {
    const remaining = cropQueue.slice(1)
    setCropQueue([])
    await uploadFile(croppedFile)
    if (remaining.length) setCropQueue(remaining)
  }

  const cancelCrop = () => setCropQueue([])

  const onDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    if (!progress) addFiles(event.dataTransfer.files)
  }

  const removeAt = (index) => onChange(value.filter((_, i) => i !== index))
  const makeMain = (index) => onChange([value[index], ...value.filter((_, i) => i !== index)])
  const busy = progress != null || Boolean(cropFile)
  const isSquare = aW === 1 && aH === 1

  const dropZone = (
    <div
      onClick={() => !busy && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'relative flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors',
        dragging ? 'border-neifert bg-neifert/5' : 'border-glassborder hover:border-neifert/60',
        busy && 'pointer-events-none opacity-90'
      )}
    >
      {progress != null ? (
        <Loader2 size={26} className="animate-spin text-neifert" />
      ) : (
        <UploadCloud size={26} className="text-ink-3" />
      )}
      <p className="text-sm font-semibold text-ink">
        {progress != null ? `Procesando… ${Math.round(progress * 100)}%` : 'Arrastrá imagen o hacé clic'}
      </p>
      <p className="text-xs text-ink-3">
        JPG · PNG · WebP · resultado de hasta {maxSizeMB}MB · {multiple ? 'varias' : 'una'}
      </p>
      <p className="text-[11px] text-ink-3">
        Se recorta en formato {aW}:{aH}{isSquare ? ' (cuadrado)' : ''}
      </p>
      {progress != null && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-line">
          <div className="h-full bg-neifert transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" multiple={multiple} className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
    </div>
  )

  return (
    <div>
      {!multiple && value.length > 0 ? (
        <div className="flex gap-4">
          <div className="flex w-1/2 items-center justify-center rounded-xl border border-glassborder bg-black/5 p-2">
            {value[0] && (
              <img
                src={value[0]}
                alt=""
                className="h-full w-full rounded-lg object-cover"
                style={{ aspectRatio: `${aW}/${aH}` }}
              />
            )}
          </div>
          <div className="w-1/2">{dropZone}</div>
        </div>
      ) : (
        dropZone
      )}

      {cropFile && (
        <ImageCropper
          file={cropFile}
          aspectRatio={aspectRatio}
          onConfirm={confirmCrop}
          onCancel={cancelCrop}
        />
      )}

      {value.length > 0 && multiple && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((url, index) => (
            <div key={url} className="group relative aspect-square overflow-hidden rounded-xl border border-glassborder">
              <img src={url} alt="" className="h-full w-full object-cover" />
              {index === 0 && (
                <span className="absolute left-1 top-1 flex items-center gap-1 rounded-full bg-neifert px-1.5 py-0.5 text-[9px] font-bold text-white">
                  <Star size={9} fill="currentColor" /> Principal
                </span>
              )}
              <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                {index !== 0 && (
                  <button type="button" onClick={() => makeMain(index)} title="Marcar como principal" className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-[#0b0b0f] hover:bg-white">
                    <Star size={14} />
                  </button>
                )}
                <button type="button" onClick={() => removeAt(index)} title="Quitar" className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-neifert hover:bg-white">
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
