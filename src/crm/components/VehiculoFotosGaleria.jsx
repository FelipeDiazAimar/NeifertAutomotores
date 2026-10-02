import { useId, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ImagePlus, ImageOff, Star, Trash2, Loader2, GripVertical } from 'lucide-react'
import ImageCropper from '@/components/admin/ImageCropper'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import * as fotosSvc from '@/crm/services/fotos.service'
import { isAcceptedImageFile, isHeicFile, convertHeicToJpeg, VEHICLE_ASPECT_OPTIONS } from '@/lib/mediaFormats'
import { cn } from '@/lib/cn'

/** Lista vertical (con scroll) de todas las fotos del vehículo. El cuadrado
 *  de "+" para agregar admite drag & drop de archivos (además de click). Las
 *  fotos se reordenan arrastrando el ícono de agarre (⋮⋮) — con Pointer
 *  Events, no con HTML5 Drag and Drop nativo, que no dispara en pantallas
 *  táctiles (mismo criterio que ya usa ImageCropper para su propio drag).
 *  Ese orden es el que también sigue el carrusel principal. Comparte
 *  queryKey con VehiculoFotoCarousel, así que subir/borrar/marcar
 *  portada/reordenar actualiza ambos al toque. */
export default function VehiculoFotosGaleria({ vehiculoId }) {
  const qc = useQueryClient()
  const inputId = useId()
  const { id: autorId } = useCrmPerfil()
  const [subiendo, setSubiendo] = useState(false)
  const [convirtiendo, setConvirtiendo] = useState(false)
  const [cropQueue, setCropQueue] = useState([])
  const cropFile = cropQueue[0] ?? null
  const [arrastrandoArchivo, setArrastrandoArchivo] = useState(false)
  const [draggingId, setDraggingId] = useState(null)
  const [overId, setOverId] = useState(null)
  const [rotas, setRotas] = useState(() => new Set())
  const itemRefs = useRef(new Map())

  const key = ['crm', 'fotos', vehiculoId]
  const { data: lista = [] } = useQuery({ queryKey: key, queryFn: () => fotosSvc.listar(vehiculoId), enabled: !!vehiculoId })
  const refrescar = () => qc.invalidateQueries({ queryKey: key })

  async function procesarArchivos(fileList) {
    let files = [...fileList].filter(isAcceptedImageFile)
    if (!files.length) return

    if (files.some(isHeicFile)) {
      setConvirtiendo(true)
      try {
        files = (await Promise.all(files.map((f) => convertHeicToJpeg(f).catch(() => null)))).filter(Boolean)
      } finally {
        setConvirtiendo(false)
      }
      if (!files.length) {
        toast.error('No se pudo convertir la foto (HEIC). Probá exportarla como JPG.')
        return
      }
    }
    setCropQueue(files)
  }

  function onArchivos(e) {
    procesarArchivos(e.target.files)
    e.target.value = ''
  }

  function onDragOverArchivo(e) {
    e.preventDefault()
    // Sin esto, algunos navegadores (sobre todo Android, arrastrando desde
    // otra app) dejan el cursor en "prohibido" durante todo el arrastre aunque
    // preventDefault() ya esté puesto — el ícono depende de dropEffect, no
    // solo de que el evento esté permitido.
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    setArrastrandoArchivo(true)
  }

  function onDropArchivos(e) {
    e.preventDefault()
    e.stopPropagation()
    setArrastrandoArchivo(false)
    if (e.dataTransfer.files?.length) procesarArchivos(e.dataTransfer.files)
  }

  async function confirmarRecorte(croppedFile) {
    const restantes = cropQueue.slice(1)
    setCropQueue(restantes)
    setSubiendo(true)
    try {
      await fotosSvc.subir(vehiculoId, croppedFile, autorId)
      refrescar()
      toast.success('Foto subida correctamente.')
    } catch (err) {
      console.error('[VehiculoFotosGaleria] falló la subida de la foto', err)
      toast.error(err.message)
    } finally {
      setSubiendo(false)
    }
  }

  async function accion(fn, msg) {
    try {
      await fn()
      refrescar()
      if (msg) toast.success(msg)
    } catch (err) {
      console.error('[VehiculoFotosGaleria] falló la acción sobre la foto', err)
      toast.error(err.message)
    }
  }

  function iniciarArrastre(id, e) {
    e.preventDefault()
    setDraggingId(id)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function moverArrastre(e) {
    if (!draggingId) return
    const y = e.clientY
    for (const [id, el] of itemRefs.current) {
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (y >= rect.top && y <= rect.bottom) {
        if (id !== overId) setOverId(id)
        return
      }
    }
  }

  function soltarArrastre() {
    if (draggingId && overId && draggingId !== overId) {
      const actual = [...lista]
      const fromIdx = actual.findIndex((f) => f.id === draggingId)
      const toIdx = actual.findIndex((f) => f.id === overId)
      if (fromIdx !== -1 && toIdx !== -1) {
        const reordenada = [...actual]
        const [movida] = reordenada.splice(fromIdx, 1)
        reordenada.splice(toIdx, 0, movida)
        qc.setQueryData(key, reordenada)
        fotosSvc.reordenar(reordenada.map((f) => f.id)).catch((err) => {
          console.error('[VehiculoFotosGaleria] falló el reordenamiento', err)
          toast.error(err.message)
          refrescar()
        })
      }
    }
    setDraggingId(null)
    setOverId(null)
  }

  const cargando = subiendo || convirtiendo

  return (
    <div
      data-lenis-prevent
      onDragOver={onDragOverArchivo}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setArrastrandoArchivo(false) }}
      onDrop={onDropArchivos}
      className={cn(
        'crm-scrollbar grid grid-cols-3 gap-2 rounded-2xl transition-colors lg:flex lg:h-[30rem] lg:flex-col lg:overflow-y-auto lg:pr-1',
        arrastrandoArchivo && 'outline outline-2 outline-dashed outline-neifert',
      )}
    >
      <label
        htmlFor={inputId}
        aria-label="Agregar foto"
        onDragOver={onDragOverArchivo}
        onDrop={onDropArchivos}
        className={cn(
          'glass flex aspect-square w-full shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl p-2 text-center text-ink-3 transition-colors hover:text-ink lg:aspect-[16/10]',
          arrastrandoArchivo && 'border-2 border-dashed border-neifert text-neifert',
        )}
      >
        {cargando ? (
          <Loader2 size={20} className="animate-spin" />
        ) : (
          <>
            <ImagePlus size={20} />
            <span className="text-[10px] font-medium leading-tight">Arrastrá una foto o tocá acá</span>
          </>
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="sr-only"
        onClick={(e) => e.stopPropagation()}
        onChange={onArchivos}
      />

      {lista.map((f) => (
        <div
          key={f.id}
          ref={(el) => {
            if (el) itemRefs.current.set(f.id, el)
            else itemRefs.current.delete(f.id)
          }}
          onDragOver={onDragOverArchivo}
          onDrop={onDropArchivos}
          className={cn(
            'group relative aspect-square w-full shrink-0 overflow-hidden rounded-2xl border transition-colors lg:aspect-[16/10]',
            overId === f.id && draggingId !== f.id ? 'border-neifert' : 'border-line',
            draggingId === f.id && 'opacity-40',
          )}
        >
          {rotas.has(f.id) ? (
            <div className="grid h-full w-full place-items-center bg-neifert/5 text-ink-3">
              <ImageOff size={20} />
            </div>
          ) : (
            <img
              src={f.url}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
              onError={() => {
                console.error('[VehiculoFotosGaleria] no se pudo cargar la foto', f.id, f.url)
                setRotas((prev) => new Set(prev).add(f.id))
              }}
            />
          )}
          {arrastrandoArchivo && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-neifert/20 text-xs font-semibold text-white">
              Soltar acá
            </div>
          )}
          <button
            type="button"
            aria-label="Arrastrar para reordenar"
            onPointerDown={(e) => iniciarArrastre(f.id, e)}
            onPointerMove={moverArrastre}
            onPointerUp={soltarArrastre}
            onPointerCancel={() => { setDraggingId(null); setOverId(null) }}
            className="absolute left-1.5 top-1.5 touch-none rounded-full bg-black/50 p-1.5 text-white/90 opacity-100 transition-opacity active:cursor-grabbing sm:opacity-0 sm:group-hover:opacity-100"
          >
            <GripVertical size={14} />
          </button>
          <div className="pointer-events-none absolute inset-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={() => accion(() => fotosSvc.marcarPortada(vehiculoId, f.id), 'Portada actualizada.')}
              aria-label="Marcar portada"
              className="pointer-events-auto rounded-full bg-white/90 p-1.5 text-neutral-800"
            >
              <Star size={14} className={f.es_portada ? 'fill-amber-500 text-amber-500' : ''} />
            </button>
            <button
              onClick={() => accion(() => fotosSvc.borrar(f.id, f.url))}
              aria-label="Borrar foto"
              className="pointer-events-auto rounded-full bg-white/90 p-1.5 text-neifert"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}

      {!lista.length && !cargando && (
        <p className="col-span-3 py-2 text-center text-xs text-ink-3">Sin fotos todavía.</p>
      )}

      {cropFile && (
        <ImageCropper
          file={cropFile}
          aspectOptions={VEHICLE_ASPECT_OPTIONS}
          onConfirm={confirmarRecorte}
          onCancel={() => setCropQueue((q) => q.slice(1))}
        />
      )}
    </div>
  )
}
