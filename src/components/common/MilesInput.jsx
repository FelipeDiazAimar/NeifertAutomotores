import { useController } from 'react-hook-form'
import Input from './Input'
import { formatMiles, parseMiles } from '@/lib/numberMask'

/** Input numérico con puntos de miles mientras se tipea (21.000.000), para
 *  campos de react-hook-form (precio, km, presupuesto). El valor que llega
 *  al form sigue siendo un número plano — el punteado es solo visual. */
export default function MilesInput({ control, name, label, ...props }) {
  const { field, fieldState } = useController({ control, name })
  return (
    <Input
      label={label}
      error={fieldState.error?.message}
      inputMode="numeric"
      value={formatMiles(field.value)}
      onChange={(e) => field.onChange(parseMiles(e.target.value))}
      onBlur={field.onBlur}
      {...props}
    />
  )
}
