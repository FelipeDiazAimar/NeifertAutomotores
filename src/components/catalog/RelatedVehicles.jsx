import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchVehicles } from '@/services/vehicles.service'
import { formatUSD, formatKm } from '@/lib/formatters'

/** Carrusel horizontal con desplazamiento lento de autos de la misma
 *  categoría, ordenados por precio. Pausa al pasar el mouse. */
export default function RelatedVehicles({ current }) {
  const category = current?.category

  const { data: list = [] } = useQuery({
    queryKey: ['vehicles', 'related', category],
    queryFn: () => fetchVehicles({ category, sort: 'price-asc' }),
    enabled: Boolean(category),
  })

  const related = list.filter((v) => v.id !== current?.id)
  if (related.length < 2) return null

  // Duplicamos la lista para un loop continuo sin cortes.
  const loop = [...related, ...related]
  const duration = Math.max(related.length * 6, 24)

  return (
    <div className="mt-16">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-neifert">
            También te puede interesar
          </p>
          <h2 className="mt-1 font-display text-2xl font-extrabold text-ink">
            Más de la misma categoría
          </h2>
        </div>
        <Link to="/catalogo" className="text-sm font-semibold text-neifert hover:underline">
          Ver catálogo
        </Link>
      </div>

      <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
        <div
          className="nf-marquee-track flex w-max gap-4 group-hover:[animation-play-state:paused]"
          style={{ animationDuration: `${duration}s` }}
        >
          {loop.map((v, i) => (
            <Link
              key={`${v.id}-${i}`}
              to={`/catalogo/${v.id}`}
              className="group/card glass w-64 shrink-0 overflow-hidden rounded-[18px] shadow-glass"
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                {v.main_image_url || v.images?.[0] ? (
                  <img
                    src={v.main_image_url || v.images[0]}
                    alt={`${v.brand} ${v.model}`}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover/card:scale-105"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[#2a2a30] to-[#0b0b0f] text-xs text-white/30">
                    {v.brand}
                  </div>
                )}
                <span className="absolute left-2.5 top-2.5 rounded-full bg-white/85 px-2.5 py-0.5 text-xs font-semibold text-[#0b0b0f]">
                  {v.year}
                </span>
              </div>
              <div className="p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neifert">
                  {v.brand}
                </p>
                <p className="truncate font-display font-bold text-ink">{v.model}</p>
                <div className="mt-1.5 flex items-center justify-between">
                  <p className="font-display text-lg font-extrabold text-ink">
                    {formatUSD(v.price_usd)}
                  </p>
                  <span className="text-xs text-ink-3">{formatKm(v.km)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes nf-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .nf-marquee-track { animation: nf-marquee linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .nf-marquee-track { animation: none; }
        }
      `}</style>
    </div>
  )
}
