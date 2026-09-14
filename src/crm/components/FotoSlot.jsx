import { useId, useState } from 'react'
import { Loader2, ImagePlus, Trash2, Download } from 'lucide-react'
import { toast } from 'sonner'
import Modal from '@/components/common/Modal'
import * as fotos from '@/crm/services/fotos.service'
import { deleteMedia } from '@/services/media.service'
import { cn } from '@/lib/cn'

/** Texto → slug ascii en snake_case (saca acentos y símbolos, no solo los
 *  reemplaza por "_" a lo bruto — así "Título — frente" da "titulo_frente"
 *  en vez de perder la primera palabra). */
function slugify(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Descarga una imagen (aunque sea de otro origen, como el CDN de R2) trayendo
 *  el blob primero — el atributo `download` de un <a> no alcanza con URLs
 *  cross-origin. */
async function descargarImagen(url, nombre) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = nombre
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    toast.error('No se pudo descargar la imagen.')
  }
}

/** Slot de una sola foto en formato 4:3 (subir/reemplazar/borrar). Reutiliza
 *  el mecanismo de subida a R2 de FotosUploader pero sin galería ni
 *  vehiculo_fotos — la URL se guarda donde el padre decida (onChange).
 *  Tocar una foto ya cargada abre un modal de vista con botón de descarga,
 *  cuyo archivo se nombra con datos del auto (marca/modelo/patente) además
 *  del tipo de foto, para no depender del nombre genérico "imagen.jpg".
 *  `hideLabel`: oculta el texto de arriba cuando ya se ve en el título del
 *  modal que lo contiene (evita repetirlo). */
export default function FotoSlot({ label, url, carpeta, onChange, hideLabel = false, vehiculo = null }) {
  const inputId = useId()
  const [subiendo, setSubiendo] = useState(false)
  const [viendo, setViendo] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)

  async function subirArchivo(file) {
    if (!file) return
    setSubiendo(true)
    try {
      const nuevaUrl = await fotos.subirArchivoUnico(carpeta, file)
      onChange(nuevaUrl)
      if (url) deleteMedia(url).catch((e) => console.warn('[fotoSlot] no se pudo borrar en R2', url, e.message))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubiendo(false)
    }
  }

  function onArchivo(e) {
    const file = e.target.files[0]
    e.target.value = ''
    subirArchivo(file)
  }

  function onDrop(e) {
    e.preventDefault()
    setArrastrando(false)
    subirArchivo(e.dataTransfer.files?.[0])
  }

  const nombreArchivo = [vehiculo?.marca, vehiculo?.modelo, vehiculo?.patente, label]
    .filter(Boolean)
    .map(slugify)
    .filter(Boolean)
    .join('_')
    .concat('.jpg')

  return (
    <div className="w-40 space-y-2">
      {!hideLabel && (
        <p id={`${inputId}-label`} className="text-sm font-medium text-ink">
          {label}
        </p>
      )}
      <div className="relative aspect-[4/3] w-40 overflow-hidden rounded-2xl">
        {url ? (
          <>
            <button
              type="button"
              onClick={() => setViendo(true)}
              aria-label={`Ver ${label}`}
              className="block h-full w-full"
            >
              <img src={url} alt={label} className="h-full w-full object-cover" />
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(null)
                deleteMedia(url).catch((e) => console.warn('[fotoSlot] no se pudo borrar en R2', url, e.message))
              }}
              aria-label={`Borrar ${label}`}
              className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-neifert"
            >
              <Trash2 size={14} />
            </button>
          </>
        ) : (
          <label
            htmlFor={inputId}
            onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={onDrop}
            className={cn(
              'glass flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-ink/15 text-ink-3 transition-colors hover:border-neifert/40 hover:text-neifert',
              arrastrando && 'border-neifert text-neifert',
              subiendo && 'pointer-events-none opacity-80',
            )}
          >
            {subiendo ? (
              <Loader2 size={22} className="animate-spin" />
            ) : (
              <>
                <ImagePlus size={22} />
                <span className="px-2 text-center text-[11px] font-medium leading-tight">
                  Arrastrá una foto o tocá acá
                </span>
              </>
            )}
          </label>
        )}
      </div>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        aria-label={label}
        className="sr-only"
        onClick={(e) => e.stopPropagation()}
        onChange={onArchivo}
      />

      <Modal open={viendo} onClose={() => setViendo(false)} title={label} size="lg">
        {url && (
          <div className="space-y-4">
            <img src={url} alt={label} className="max-h-[70vh] w-full rounded-2xl object-contain" />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => descargarImagen(url, nombreArchivo)}
                className="glass inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm font-semibold text-ink transition-colors hover:border-ink/30"
              >
                <Download size={16} /> Descargar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
