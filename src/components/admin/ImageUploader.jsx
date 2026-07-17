import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Star, UploadCloud, X } from 'lucide-react'
import { uploadImageMedia } from '@/services/media.service'
import { MAX_IMAGE_MB, isAcceptedImageFile, isHeicFile, convertHeicToJpeg } from '@/lib/mediaFormats'
import { cn } from '@/lib/cn'
import ImageCropper from './ImageCropper'

const DEFAULT_ASPECT = { w: 1, h: 1 }

export default function ImageUploader({ value = [], onChange, multiple = true, aspectRatio = DEFAULT_ASPECT, maxSizeMB = MAX_IMAGE_MB }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState(null)
  const [converting, setConverting] = useState(false)
  const [cropQueue, setCropQueue] = useState([])
  const cropFile = cropQueue[0]
  const { w: aW, h: aH } = aspectRatio

  const addFiles = async (fileList) => {
    const all = Array.from(fileList)
    console.log(
      '[IMG] addFiles: seleccionados',
      all.length,
      all.map((f) => ({ name: f.name, type: f.type || '(vacío)', sizeMB: +(f.size / 1048576).toFixed(2) }))
    )
    let files = all.filter(isAcceptedImageFile)
    if (!files.length) {
      console.warn('[IMG] addFiles: ningún archivo aceptado por isAcceptedImageFile')
      return toast.error('Seleccioná una imagen válida (JPG, PNG, WebP o HEIC).')
    }
    console.log('[IMG] addFiles: aceptados', files.length)

    // Las fotos de iPhone (HEIC) hay que convertirlas a JPEG acá, antes del
    // recorte: ni <img> ni createImageBitmap() las decodifican de forma
    // confiable en todos los navegadores, y eso es lo que las "cuelga" en
    // silencio en la pantalla de recorte.
    if (files.some(isHeicFile)) {
      setConverting(true)
      try {
        files = await Promise.all(
          files.map(async (f) => {
            try {
              return await convertHeicToJpeg(f)
            } catch (e) {
              console.error('[IMG] addFiles: convertHeicToJpeg FALLÓ para', f.name, e)
              toast.error(`No se pudo convertir "${f.name}" (HEIC). Probá exportarla como JPG desde Fotos.`)
              return null
            }
          })
        )
        files = files.filter(Boolean)
      } finally {
        setConverting(false)
      }
      if (!files.length) return
    }

    console.log('[IMG] addFiles: listos', files.length, '→ abriendo cropper')
    setCropQueue(multiple ? files : files.slice(0, 1))
  }

  const uploadFile = async (file) => {
    console.log('[IMG] uploadFile: inicio', {
      name: file.name,
      type: file.type || '(vacío)',
      sizeMB: +(file.size / 1048576).toFixed(2),
      maxSizeMB,
      skipRatioCheck: aW !== 1 || aH !== 1,
    })
    setProgress(0)
    try {
      const res = await uploadImageMedia(file, {
        onProgress: (p) => {
          console.log('[IMG] uploadFile: progreso', Math.round(p * 100) + '%')
          setProgress(p)
        },
        maxSizeMB,
        skipRatioCheck: aW !== 1 || aH !== 1,
      })
      console.log('[IMG] uploadFile: OK', { url: res.url, demo: res.demo, ratio: res.ratio })
      onChange(multiple ? [...value, res.url] : [res.url])
      if (res.warning) toast.warning(res.warning, { duration: 5000 })
    } catch (error) {
      console.error('[IMG] uploadFile: ERROR', error?.message, error)
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
  const removeSingle = () => onChange([])
  const makeMain = (index) => onChange([value[index], ...value.filter((_, i) => i !== index)])
  const busy = progress != null || converting || Boolean(cropFile)
  const isSquare = aW === 1 && aH === 1

  const dropZone = (
    <div
      onClick={() => {
        if (busy) return
        console.log('[IMG] dropzone: tap → abriendo selector nativo')
        inputRef.current?.click()
      }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'relative flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors',
        dragging ? 'border-neifert bg-neifert/5' : 'border-glassborder hover:border-neifert/60',
        busy && 'pointer-events-none opacity-90'
      )}
    >
      {progress != null || converting ? (
        <Loader2 size={26} className="animate-spin text-neifert" />
      ) : (
        <UploadCloud size={26} className="text-ink-3" />
      )}
      <p className="text-sm font-semibold text-ink">
        {converting
          ? 'Convirtiendo foto de iPhone…'
          : progress == null
            ? 'Arrastrá imagen o hacé clic'
            : progress < 0.5
              ? 'Procesando imagen…'
              : `Subiendo… ${Math.round(progress * 100)}%`}
      </p>
      <p className="text-xs text-ink-3">
        JPG · PNG · WebP · HEIC · resultado de hasta {maxSizeMB}MB · {multiple ? 'varias' : 'una'}
      </p>
      <p className="text-[11px] text-ink-3">
        Se recorta en formato {aW}:{aH}{isSquare ? ' (cuadrado)' : ''}
      </p>
      {progress != null && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-line">
          <div className="h-full bg-neifert transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple={multiple}
        className="hidden"
        // El input está anidado dentro del div clickeable. Sin esto, el
        // .click() programático de más abajo dispara un evento que hace
        // bubbling hasta el div y vuelve a disparar SU onClick → vuelve a
        // llamar .click() → bucle de auto-disparo (confirmado en logs: el
        // tap abría el selector 3 veces en el mismo milisegundo, lo que
        // rompía la selección de foto en iOS).
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
      />
    </div>
  )

  return (
    <div>
      {!multiple && value.length > 0 ? (
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex min-w-0 flex-1 items-center justify-center rounded-xl border border-glassborder bg-black/5 p-2">
            {value[0] && (
              <div className="relative w-full overflow-hidden rounded-lg" style={{ aspectRatio: `${aW}/${aH}` }}>
                <img src={value[0]} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={removeSingle}
                  aria-label="Quitar imagen"
                  className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-neifert shadow hover:bg-white"
                >
                  <X size={15} />
                </button>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">{dropZone}</div>
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
