import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import Select from '@/components/common/Select'
import { clienteSchema } from '@/crm/lib/clienteSchema'
import { CANAL_OPCIONES } from '@/crm/lib/formatCliente'

const TIPOS = ['Pickup', 'Sedan', 'SUV', 'Hatchback', 'Utilitario', 'Coupé', 'Familiar', 'Otro']
const TRANS = ['manual', 'automático']
const opt = (arr) => arr.map((x) => ({ id: x, label: x }))

function Seccion({ titulo, children }) {
  return (
    <fieldset className="space-y-3">
      <legend className="font-display text-sm font-bold text-ink">{titulo}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

export default function ClienteForm({ inicial, onGuardar, guardando }) {
  const {
    register, handleSubmit, control, formState: { errors },
  } = useForm({
    resolver: zodResolver(clienteSchema),
    defaultValues: { interes_cero_km: false, ...inicial },
  })

  return (
    <form onSubmit={handleSubmit(onGuardar)} className="space-y-6">
      <Seccion titulo="Datos">
        <Input label="Nombre" {...register('nombre')} error={errors.nombre?.message} />
        <Input label="Teléfono" {...register('telefono')} />
        <Input label="Localidad" {...register('localidad')} />
        <Input label="Cumpleaños" type="date" {...register('fecha_cumple')} />
        <Controller
          control={control} name="canal"
          render={({ field }) => (
            <Select label="Canal" options={CANAL_OPCIONES} value={field.value ?? ''} onChange={field.onChange} />
          )}
        />
      </Seccion>

      <Seccion titulo="Interés">
        <Input label="Marca" {...register('marca_interes')} />
        <Input label="Modelo" {...register('modelo_interes')} />
        <Controller
          control={control} name="tipo_interes"
          render={({ field }) => (
            <Select label="Tipo" options={opt(TIPOS)} value={field.value ?? ''} onChange={field.onChange} />
          )}
        />
        <Controller
          control={control} name="trans_interes"
          render={({ field }) => (
            <Select label="Transmisión" options={opt(TRANS)} value={field.value ?? ''} onChange={field.onChange} />
          )}
        />
        <Input label="Año desde" type="number" {...register('anio_min')} error={errors.anio_min?.message} />
        <Input label="Año hasta" type="number" {...register('anio_max')} error={errors.anio_max?.message} />
        <Input label="Presupuesto" type="number" {...register('presupuesto')} error={errors.presupuesto?.message} />
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" {...register('interes_cero_km')} />
          Le interesa 0 km
        </label>
      </Seccion>

      <Seccion titulo="Notas">
        <div className="sm:col-span-2">
          <Input as="textarea" {...register('notas')} />
        </div>
      </Seccion>

      <div className="flex justify-end">
        <Button type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  )
}
