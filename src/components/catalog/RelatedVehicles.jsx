import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listarPublicos } from '@/crm/services/vehiculosPublico.service'
import { formatKm } from '@/lib/formatters'
import SoldRibbon from '@/components/catalog/SoldRibbon'

/** Carrusel horizontal con desplazamiento lento de autos de la misma
 *  categoría, ordenados por año. Pausa al pasar el mouse.
 *  `condition` limita los relacionados a la misma sección (usados / 0km). */
export default function RelatedVehicles({
  current,
  condition = 'todos',
  basePath = '/catalogo',
}) {
  const category = current?.category

  const { data: list = [] } = useQuery({
    queryKey: ['vehicles', 'related', category, condition],
    queryFn: () => listarPublicos({ category, sort: 'year-desc', condition }),
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
          <p className="text-neifert text-xs font-bold tracking-wider uppercase">
            También te puede interesar
          </p>
          <h2 className="font-display text-ink mt-1 text-2xl font-extrabold">
            Más de la misma categoría
          </h2>
        </div>
        <Link
          to={basePath}
          className="text-neifert text-sm font-semibold hover:underline"
        >
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
              to={`${basePath}/${v.id}`}
              className="group/card glass shadow-glass relative w-64 shrink-0 overflow-hidden rounded-[18px]"
            >
              {(v.status || 'disponible') === 'vendido' && <SoldRibbon />}
              {(v.status || 'disponible') === 'reservado' && (
                <SoldRibbon label="Reservado" tone="gray" />
              )}
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
                <span className="absolute top-2.5 left-2.5 rounded-full bg-white/85 px-2.5 py-0.5 text-xs font-semibold text-[#0b0b0f]">
                  {v.year}
                </span>
              </div>
              <div className="p-3.5">
                <p className="text-neifert text-[10px] font-bold tracking-wider uppercase">
                  {v.brand}
                </p>
                <p className="font-display text-ink truncate font-bold">{v.model}</p>
                <div className="mt-1.5 flex items-center justify-between">
                  <p className="font-display text-ink text-lg font-extrabold">
                    Consultar
                  </p>
                  <span className="text-ink-3 text-xs">{formatKm(v.km)}</span>
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
