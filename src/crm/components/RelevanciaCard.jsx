import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Car } from 'lucide-react'
import Badge from '@/components/common/Badge'
import SoldRibbon from '@/components/catalog/SoldRibbon'
import { estadoLabel, estadoVariant } from '@/crm/lib/formatVehiculo'
import { formatKm, formatPrice } from '@/lib/formatters'
import { cn } from '@/lib/cn'


const portadaDe = (v) => {
  const fotos = [...(v.fotos ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  return (fotos.find((f) => f.es_portada) ?? fotos[0])?.url ?? null
}
const titulo = (v) => [v.marca, v.modelo].filter(Boolean).join(' ') || 'Sin título'
const duenio = (v) => [v.duenio_nombre, v.duenio_apellido].filter(Boolean).join(' ')

/** Tarjeta con la info que distingue un auto de otro y de quién es. Se usa
 *  como tooltip (al pasar el mouse) y es lo único que se ve al arrastrar. */
function Detalle({ v }) {
  const foto = portadaDe(v)
  return (
    <div className="w-64">
      {foto && <img src={foto} alt="" className="mb-2 aspect-[4/3] w-full rounded-xl object-cover" />}
      <p className="font-display text-sm font-bold text-ink">{titulo(v)}</p>
      {v.version && <p className="text-xs text-ink-2">{v.version}</p>}
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">Año</dt>
          <dd className="text-ink">{v.anio ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">Km</dt>
          <dd className="text-ink">{v.es_0km ? '0 km' : formatKm(v.km)}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">Color</dt>
          <dd className="text-ink">{v.color || '—'}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">Patente</dt>
          <dd className="text-ink">{v.patente || '—'}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">Precio</dt>
          <dd className="text-ink">{formatPrice(v.precio_contado, v.moneda)}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">Estado</dt>
          <dd>
            <Badge variant={estadoVariant(v.estado)}>{estadoLabel(v.estado)}</Badge>
          </dd>
        </div>
      </dl>
      <p className="mt-2 border-t border-line pt-2 text-xs text-ink-2">
        <span className="font-semibold text-ink-3">Dueño: </span>
        {duenio(v) || 'Sin datos'}
      </p>
    </div>
  )
}

/** Card del tablero. Se agarra entera (los listeners de arrastre van en el
 *  contenedor); `posicion` muestra el # en el ranking. */
export default function RelevanciaCard({
  vehiculo: v,
  posicion,
  ocultarInfo = false,
  sinInfo = false,
  className,
  ...props
}) {
  const ref = useRef(null)
  // Rectángulo de la card sobre la que está el mouse (null = sin tooltip).
  const [ancla, setAncla] = useState(null)
  const foto = portadaDe(v)

  const mostrar = () => {
    if (sinInfo || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    setAncla({ left: r.left, right: r.right, top: r.top })
  }

  // Ref del tooltip: con el tooltip ya montado se mide su tamaño real y se lo
  // acomoda dentro de la pantalla (a la derecha de la card; si no entra, a la
  // izquierda; y siempre dentro de los márgenes arriba/abajo). Se muestra
  // recién cuando tiene su lugar, así no "salta".
  const acomodar = (el) => {
    if (!el || !ancla) return
    const M = 8
    const { offsetWidth: w, offsetHeight: h } = el
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    let left = ancla.right + M
    if (left + w > vw - M) left = ancla.left - w - M
    left = Math.max(M, Math.min(left, vw - w - M))
    const top = Math.max(M, Math.min(ancla.top, vh - h - M))
    el.style.left = `${left}px`
    el.style.top = `${top}px`
    el.style.visibility = 'visible'
  }

  return (
    <div
      ref={ref}
      onMouseEnter={mostrar}
      onMouseLeave={() => setAncla(null)}
      className={cn(
        'glass relative cursor-grab select-none overflow-hidden rounded-2xl active:cursor-grabbing',
        v.estado === 'vendido' && 'opacity-80',
        className,
      )}
      {...props}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-surface">
        {foto ? (
          <img src={foto} alt="" draggable={false} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-ink-3">
            <Car size={28} />
          </div>
        )}
        {v.estado === 'vendido' && <SoldRibbon label="Vendido" />}
        {v.estado === 'reservado' && <SoldRibbon label="Reservado" tone="gray" />}
        {posicion != null && (
          <span className="absolute left-2 top-2 z-30 grid h-7 min-w-7 place-items-center rounded-full bg-neifert px-2 text-xs font-bold text-white shadow">
            {posicion}
          </span>
        )}
      </div>
      <div className="px-3 py-2">
        <p className="truncate text-sm font-semibold text-ink">{titulo(v)}</p>
        <p className="truncate text-xs text-ink-3">
          {[v.version, v.anio].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>

      {ancla &&
        !ocultarInfo &&
        createPortal(
          <div
            ref={acomodar}
            role="tooltip"
            style={{ left: 0, top: 0, visibility: 'hidden' }}
            className="glass glass-popover pointer-events-none fixed z-[60] rounded-2xl p-3 shadow-glass"
          >
            <Detalle v={v} />
          </div>,
          document.body,
        )}
    </div>
  )
}
