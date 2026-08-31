import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import Select from '@/components/common/Select'
import { vehiculoSchema } from '@/crm/lib/vehiculoSchema'

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

function Check({ name, label, register }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-2">
      <input type="checkbox" {...register(name)} />
      {label}
    </label>
  )
}

export default function VehiculoForm({ inicial, onGuardar, guardando }) {
  const {
    register, handleSubmit, control, formState: { errors },
  } = useForm({
    resolver: zodResolver(vehiculoSchema),
    defaultValues: {
      moneda: 'ARS', consignacion: false, carpeta_completa: false,
      carpeta_con_oficio: false, carpeta_entregada: false, tiene_iva: false,
      ...inicial,
    },
  })

  return (
    <form onSubmit={handleSubmit(onGuardar)} className="space-y-6">
      <Seccion titulo="Datos">
        <Input label="Marca" {...register('marca')} error={errors.marca?.message} />
        <Input label="Modelo" {...register('modelo')} error={errors.modelo?.message} />
        <Input label="Versión" {...register('version')} />
        <Controller
          control={control} name="tipo"
          render={({ field }) => (
            <Select label="Tipo" options={opt(TIPOS)} value={field.value ?? ''} onChange={field.onChange} />
          )}
        />
        <Input label="Año" type="number" {...register('anio')} error={errors.anio?.message} />
        <Input label="Km" type="number" {...register('km')} error={errors.km?.message} />
        <Controller
          control={control} name="transmision"
          render={({ field }) => (
            <Select label="Transmisión" options={opt(TRANS)} value={field.value ?? ''} onChange={field.onChange} />
          )}
        />
        <Input label="Color" {...register('color')} />
        <Input label="Patente" {...register('patente')} />
      </Seccion>

      <Seccion titulo="Precio">
        <Controller
          control={control} name="moneda"
          render={({ field }) => (
            <Select
              label="Moneda"
              options={[{ id: 'ARS', label: 'ARS' }, { id: 'USD', label: 'USD' }]}
              value={field.value} onChange={field.onChange}
            />
          )}
        />
        <span />
        <Input label="Precio contado" type="number" {...register('precio_contado')} error={errors.precio_contado?.message} />
        <Input label="Precio en canje" type="number" {...register('precio_canje')} error={errors.precio_canje?.message} />
      </Seccion>

      <Seccion titulo="Dueño">
        <Input label="Nombre" {...register('duenio_nombre')} />
        <Input label="Apellido" {...register('duenio_apellido')} />
        <Input label="Contacto" {...register('duenio_contacto')} />
      </Seccion>

      <Seccion titulo="Documentación">
        <Controller
          control={control} name="itv"
          render={({ field }) => (
            <Select
              label="ITV"
              options={[{ id: 'si', label: 'Sí' }, { id: 'no', label: 'No' }]}
              value={field.value ?? ''} onChange={field.onChange}
            />
          )}
        />
        <Input label="Vencimiento ITV" type="date" {...register('itv_venc')} />
        <Input label="Origen" {...register('origen')} />
        <Input label="Tipo de consignación" {...register('tipo_consignacion')} />
        <div className="sm:col-span-2 flex flex-wrap gap-x-6 gap-y-2">
          <Check name="consignacion" label="En consignación" register={register} />
          <Check name="carpeta_completa" label="Carpeta completa" register={register} />
          <Check name="carpeta_con_oficio" label="Carpeta con oficio" register={register} />
          <Check name="carpeta_entregada" label="Carpeta entregada" register={register} />
          <Check name="tiene_iva" label="Tiene IVA" register={register} />
        </div>
      </Seccion>

      <Seccion titulo="Nota">
        <div className="sm:col-span-2">
          <Input as="textarea" {...register('nota')} />
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
