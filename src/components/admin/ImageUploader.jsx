import { useRef, useState } from 'react'
import { UploadCloud, X, Star } from 'lucide-react'
import { filesToDataUrls, onlyImages } from '@/lib/files'
import { cn } from '@/lib/cn'

/** Subida de imágenes por explorador o drag & drop. Guarda dataURL.
 *  value: string[] (urls/dataURL) · onChange: (urls) => void
 *  La primera imagen es la principal (badge ★). */
export default function ImageUploader({ value = [], onChange, multiple = true }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  const addFiles = async (fileList) => {
    const imgs = onlyImages(fileList)
    if (!imgs.length) return
    setBusy(true)
    try {
      const urls = await filesToDataUrls(imgs)
      onChange(multiple ? [...value, ...urls] : [urls[0]])
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const removeAt = (i) => onChange(value.filter((_, idx) => idx !== i))
  const makeMain = (i) =>
    onChange([value[i], ...value.filter((_, idx) => idx !== i)])

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors',
          dragging ? 'border-neifert bg-neifert/5' : 'border-glassborder hover:border-neifert/60'
        )}
      >
        <UploadCloud size={26} className="text-ink-3" />
        <p className="text-sm font-semibold text-ink">
          {busy ? 'Procesando…' : 'Arrastrá fotos acá o hacé clic'}
        </p>
        <p className="text-xs text-ink-3">PNG, JPG o WebP · {multiple ? 'varias' : 'una'}</p>
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
              {i === 0 && (
                <span className="absolute left-1 top-1 flex items-center gap-1 rounded-full bg-neifert px-1.5 py-0.5 text-[9px] font-bold text-white">
                  <Star size={9} fill="currentColor" /> Principal
                </span>
              )}
              <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                {i !== 0 && (
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
