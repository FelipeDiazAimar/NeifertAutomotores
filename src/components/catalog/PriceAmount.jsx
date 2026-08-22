import { cn } from '@/lib/cn'

/** Precio con el prefijo de moneda ("AR$"/"U$S") más chico (0.72em, escala
 *  con el tamaño del precio) y en tono más claro en todas las vistas.
 *  Por defecto en mobile el prefijo va en línea propia y en desktop en la
 *  misma línea (catálogo público). `stack` = siempre en línea propia
 *  (admin desktop); `stack="sm"` = en línea en mobile y en línea propia
 *  desde sm (admin). La separación entre el prefijo y el monto se ajusta
 *  con el `leading-[…]` del span. */
export default function PriceAmount({ value, stack = false }) {
  const idx = value.indexOf(' ')
  if (idx === -1) return value
  const style =
    stack === true || stack === 'always'
      ? 'block leading-[0.9]'
      : stack === 'sm'
        ? 'mr-[0.25em] inline leading-none sm:mr-0 sm:block sm:leading-[0.9]'
        : 'block leading-[0.9] sm:mr-[0.25em] sm:inline sm:leading-none'
  return (
    <>
      <span className={cn('text-[0.72em] text-ink-2', style)}>
        {value.slice(0, idx)}
      </span>
      {value.slice(idx + 1)}
    </>
  )
}
