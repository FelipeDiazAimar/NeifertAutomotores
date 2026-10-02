import { useId, useState } from 'react'
import { Loader2, ImagePlus, Trash2, Download } from 'lucide-react'
import Modal from '@/components/common/Modal'
import { useGestoriaFotos, useGestoriaFotosMutations } from '@/crm/hooks/useGestoriaFotos'
import { descargarImagen } from '@/crm/lib/descargarImagen'
import { cn } from '@/lib/cn'

function slugify(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Slot documental con fotos ILIMITADAS (seguro, título frente/dorso). Misma
 *  idea que FotoSlot pero guardando N fotos en crm.gestoria_fotos en vez de
 *  una única URL. Acepta varios archivos a la vez + drag & drop. Tocar una
 *  foto abre el modal de vista con descarga (nombrada con datos del auto). */
export default function FotoMultiSlot({ label, slot, vehiculoId, vehiculo = null }) {
  const inputId = useId()
  const [viendo, setViendo] = useState(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [rotas, setRotas] = useState(() => new Set())
  const { data: fotos = [], isLoading } = useGestoriaFotos(vehiculoId, slot)
  const { agregar, borrar } = useGestoriaFotosMutations(vehiculoId, slot)
  const subiendo = agregar.isPending

  function subirArchivos(fileList) {
    const files = [...(fileList ?? [])].filter((f) => f?.type?.startsWith('image/'))
    files.forEach((f) => agregar.mutate(f))
  }

  function onArchivo(e) {
    subirArchivos(e.target.files)
    e.target.value = ''
  }

  function onDrop(e) {
    e.preventDefault()
    setArrastrando(false)
    subirArchivos(e.dataTransfer.files)
  }

  const nombreArchivo = (f, i) =>
    [vehiculo?.marca, vehiculo?.modelo, vehiculo?.patente, label, i + 1]
      .filter(Boolean)
      .map(slugify)
      .filter(Boolean)
      .join('_')
      .concat('.jpg')

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-ink">
        {label}
        {fotos.length > 0 && <span className="ml-1.5 text-xs font-normal text-ink-3">({fotos.length})</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {fotos.map((f, i) => (
          <div key={f.id} className="relative aspect-[4/3] w-40 overflow-hidden rounded-2xl">
            <button
              type="button"
              onClick={() => setViendo(f)}
              aria-label={`Ver ${label} ${i + 1}`}
              className="glass flex h-full w-full items-center justify-center"
            >
              {rotas.has(f.id) ? (
                <span className="px-2 text-center text-[11px] font-medium leading-tight text-ink-3">
                  No se pudo cargar la imagen
                </span>
              ) : (
                <img
                  src={f.url}
                  alt={`${label} ${i + 1}`}
                  className="h-full w-full object-cover"
                  onError={() => setRotas((prev) => new Set(prev).add(f.id))}
                />
              )}
            </button>
            <button
              type="button"
              onClick={() => borrar.mutate({ id: f.id, url: f.url })}
              aria-label={`Borrar ${label} ${i + 1}`}
              className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-neifert"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        <label
          htmlFor={inputId}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={onDrop}
          className={cn(
            'glass flex aspect-[4/3] w-40 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-ink/15 text-ink-3 transition-colors hover:border-neifert/40 hover:text-neifert',
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
                Arrastrá fotos o tocá acá
              </span>
            </>
          )}
        </label>
      </div>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        aria-label={label}
        className="sr-only"
        onClick={(e) => e.stopPropagation()}
        onChange={onArchivo}
      />
      {isLoading && fotos.length === 0 && (
        <p className="text-xs text-ink-3">Cargando fotos…</p>
      )}

      <Modal open={Boolean(viendo)} onClose={() => setViendo(null)} title={label} size="lg">
        {viendo && (
          <div className="space-y-4">
            {rotas.has(viendo.id) ? (
              <p className="py-10 text-center text-sm text-ink-3">
                No se pudo cargar la imagen. Probá subirla de nuevo.
              </p>
            ) : (
              <>
                <img src={viendo.url} alt={label} className="max-h-[70vh] w-full rounded-2xl object-contain" />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => descargarImagen(viendo.url, nombreArchivo(viendo, fotos.indexOf(viendo)))}
                    className="glass inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm font-semibold text-ink transition-colors hover:border-ink/30"
                  >
                    <Download size={16} /> Descargar
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
