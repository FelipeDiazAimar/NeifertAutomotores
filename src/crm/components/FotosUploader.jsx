import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ImagePlus, Star, Trash2, Loader2 } from 'lucide-react'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import * as fotos from '@/crm/services/fotos.service'

export default function FotosUploader({ vehiculoId }) {
  const qc = useQueryClient()
  const inputRef = useRef(null)
  const { id: autorId } = useCrmPerfil()
  const [subiendo, setSubiendo] = useState(false)

  const key = ['crm', 'fotos', vehiculoId]
  const { data: lista = [] } = useQuery({ queryKey: key, queryFn: () => fotos.listar(vehiculoId), enabled: !!vehiculoId })
  const refrescar = () => qc.invalidateQueries({ queryKey: key })

  async function onArchivos(e) {
    const files = [...e.target.files]
    e.target.value = ''
    if (!files.length) return
    setSubiendo(true)
    try {
      for (const f of files) await fotos.subir(vehiculoId, f, autorId)
      refrescar()
    } catch (err) {
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
      toast.error(err.message)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {lista.map((f) => (
          <div key={f.id} className="group relative aspect-square overflow-hidden rounded-2xl border border-line">
            <img src={f.url} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={() => accion(() => fotos.marcarPortada(vehiculoId, f.id), 'Portada actualizada.')}
                aria-label="Marcar portada"
                className="rounded-full bg-white/90 p-1.5 text-ink"
              >
                <Star size={14} className={f.es_portada ? 'fill-amber text-amber' : ''} />
              </button>
              <button
                onClick={() => accion(() => fotos.borrar(f.id))}
                aria-label="Borrar foto"
                className="rounded-full bg-white/90 p-1.5 text-neifert"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
          className="glass grid aspect-square place-items-center rounded-2xl text-ink-3 hover:text-ink"
        >
          {subiendo ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={onArchivos} />
      </div>
      <p className="text-xs text-ink-3">Tocá una foto para elegir portada o borrarla.</p>
    </div>
  )
}
