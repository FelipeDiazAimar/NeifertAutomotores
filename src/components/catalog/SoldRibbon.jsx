import { cn } from '@/lib/cn'

/** Lazo diagonal semitransparente de "Vendido" con letras negras.
 *  Se monta UNA vez sobre el card (o la galería en el detalle), no por foto:
 *  como el carrusel cambia las imágenes debajo, el lazo queda fijo y se ve
 *  igual en todas las fotos. El padre debe ser `relative` + `overflow-hidden`. */
export default function SoldRibbon({ label = 'Vendido', large = false, className }) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 z-20 overflow-hidden', className)}
    >
      <div
        className={cn(
          'absolute left-1/2 top-1/2 w-[170%] -translate-x-1/2 -translate-y-1/2 -rotate-[22deg] bg-red-600/70 text-center shadow-lg',
          large ? 'py-2.5' : 'py-1 sm:py-1.5',
        )}
      >
        <span
          className={cn(
            'font-extrabold uppercase text-black',
            large ? 'text-lg tracking-[0.35em] sm:text-xl' : 'text-[11px] tracking-[0.3em] sm:text-sm',
          )}
        >
          {label}
        </span>
      </div>
    </div>
  )
}
