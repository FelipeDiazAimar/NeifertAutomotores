import { Controller } from 'react-hook-form'
import TimePicker from './TimePicker'

/** TimePicker para formularios de react-hook-form (reemplaza <Input type="time" {...register} />). */
export default function TimeField({ control, name, label, error }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => <TimePicker label={label} value={field.value || ''} onChange={field.onChange} error={error} />}
    />
  )
}
