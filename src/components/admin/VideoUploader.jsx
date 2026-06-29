import { useRef, useState } from 'react'
import { UploadCloud, X, Film } from 'lucide-react'
import { fileToDataUrl } from '@/lib/files'
import { cn } from '@/lib/cn'

/** Subida de un video por explorador o drag & drop (dataURL).
 *  value: string (url/dataURL) · onChange: (url) => void
 *  Para videos pesados conviene pegar una URL externa en su lugar. */
export default function VideoUploader({ value, onChange }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  const addFile = async (file) => {
    if (!file || !file.type.startsWith('video/')) return
    setBusy(true)
    try {
      onChange(await fileToDataUrl(file))
    } finally {
      setBusy(false)
    }
  }

  if (value) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-glassborder">
        <video src={value} className="h-40 w-full bg-black object-contain" controls muted />
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Quitar video"
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-neifert hover:bg-white"
        >
          <X size={15} />
        </button>
      </div>
    )
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
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
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors',
        dragging ? 'border-neifert bg-neifert/5' : 'border-glassborder hover:border-neifert/60'
      )}
    >
      {busy ? <Film size={24} className="text-ink-3" /> : <UploadCloud size={24} className="text-ink-3" />}
      <p className="text-sm font-semibold text-ink">
        {busy ? 'Procesando…' : 'Arrastrá un video o hacé clic'}
      </p>
      <p className="text-xs text-ink-3">MP4/WebM · para clips largos usá una URL</p>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          addFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
