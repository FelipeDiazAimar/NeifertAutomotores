import { Controller } from 'react-hook-form'
import DatePicker from './DatePicker'

/** DatePicker para formularios de react-hook-form (reemplaza <Input type="date" {...register} />). */
export default function DateField({ control, name, label, error, placeholder }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <DatePicker
          label={label}
          value={field.value || ''}
          onChange={field.onChange}
          placeholder={placeholder}
          error={error}
        />
      )}
    />
  )
}
