import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as fotosSvc from '@/crm/services/fotos.service'
import { cn } from '@/lib/cn'

/** Foto principal del vehículo: rota sola entre todas las fotos cargadas
 *  (comparte cache con la galería vertical, misma queryKey). */
export default function VehiculoFotoCarousel({ vehiculoId, patente }) {
  const { data: lista = [] } = useQuery({
    queryKey: ['crm', 'fotos', vehiculoId],
    queryFn: () => fotosSvc.listar(vehiculoId),
    enabled: !!vehiculoId,
  })
  const [i, setI] = useState(0)
  const [rotas, setRotas] = useState(() => new Set())

  useEffect(() => {
    if (lista.length < 2) return
    const t = setInterval(() => setI((prev) => (prev + 1) % lista.length), 4000)
    return () => clearInterval(t)
  }, [lista.length])

  useEffect(() => {
    if (i >= lista.length) setI(0)
  }, [lista.length, i])

  const actual = lista[i]
  const actualRota = actual && rotas.has(actual.id)

  return (
    <div className="relative aspect-[16/7] w-full overflow-hidden bg-neifert/5">
      {actual && !actualRota ? (
        <img
          key={actual.id}
          src={actual.url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => {
            console.error('[VehiculoFotoCarousel] no se pudo cargar la foto', actual.id, actual.url)
            setRotas((prev) => new Set(prev).add(actual.id))
          }}
        />
      ) : (
        <div className="grid h-full w-full place-items-center">
          <span className="font-display text-3xl font-bold tracking-widest text-neifert/70">
            {patente || 'SIN FOTO'}
          </span>
        </div>
      )}
      {lista.length > 1 && (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
          {lista.map((f, idx) => (
            <span
              key={f.id}
              className={cn('h-1.5 w-1.5 rounded-full transition-colors', idx === i ? 'bg-white' : 'bg-white/40')}
            />
          ))}
        </div>
      )}
    </div>
  )
}
