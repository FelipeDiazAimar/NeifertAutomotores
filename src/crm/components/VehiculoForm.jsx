import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import Select from '@/components/common/Select'
import Combobox from '@/crm/components/Combobox'
import { useOpcionesCampo } from '@/crm/hooks/useOpcionesCampo'
import { CAMPOS as CAMPOS_COMBO } from '@/crm/services/opcionesCampo.service'
import { vehiculoSchema } from '@/crm/lib/vehiculoSchema'

// Semilla para "Tipo" — se fusiona con lo que ya haya cargado.
const TIPOS = ['Pickup', 'Sedan', 'SUV', 'Hatchback', 'Utilitario', 'Coupé', 'Familiar', 'Otro']
const TRANS = ['manual', 'automático']
const opt = (arr) => arr.map((x) => ({ id: x, label: x }))

/** Fusiona una semilla con la lista guardada, dedup sin distinguir mayúsculas. */
const conSemilla = (lista = [], semilla = []) => {
  const map = new Map()
  for (const v of [...semilla, ...lista]) {
    const t = (v ?? '').trim()
    const k = t.toLowerCase()
    if (t && !map.has(k)) map.set(k, t)
  }
  return [...map.values()]
}

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

/** Campo de texto que ofrece opciones ya usadas y admite valores nuevos. */
function CampoCombo({ control, name, label, options }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Combobox
          label={label}
          options={options}
          value={field.value ?? ''}
          onChange={field.onChange}
          error={fieldState.error?.message}
        />
      )}
    />
  )
}

export default function VehiculoForm({ inicial, onGuardar, guardando }) {
  const { opciones, registrarNuevas } = useOpcionesCampo()
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

  const opcionesTipo = conSemilla(opciones.tipo, TIPOS)

  // Antes de guardar, persiste los valores tipeados que no estaban en la lista.
  const submit = (data) => {
    const nuevas = CAMPOS_COMBO.flatMap((campo) => {
      const v = (data[campo] ?? '').trim()
      if (!v) return []
      const conocidas = campo === 'tipo' ? opcionesTipo : opciones[campo] ?? []
      const yaEsta = conocidas.some((o) => o.toLowerCase() === v.toLowerCase())
      return yaEsta ? [] : [{ campo, valor: v }]
    })
    registrarNuevas(nuevas)
    onGuardar(data)
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-6">
      <Seccion titulo="Datos">
        <CampoCombo control={control} name="marca" label="Marca" options={opciones.marca ?? []} />
        <CampoCombo control={control} name="modelo" label="Modelo" options={opciones.modelo ?? []} />
        <CampoCombo control={control} name="version" label="Versión" options={opciones.version ?? []} />
        <CampoCombo control={control} name="tipo" label="Tipo" options={opcionesTipo} />
        <Input label="Año" type="number" {...register('anio')} error={errors.anio?.message} />
        <Input label="Km" type="number" {...register('km')} error={errors.km?.message} />
        <Controller
          control={control} name="transmision"
          render={({ field }) => (
            <Select label="Transmisión" options={opt(TRANS)} value={field.value ?? ''} onChange={field.onChange} />
          )}
        />
        <CampoCombo control={control} name="color" label="Color" options={opciones.color ?? []} />
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
        <CampoCombo control={control} name="origen" label="Origen" options={opciones.origen ?? []} />
        <CampoCombo control={control} name="tipo_consignacion" label="Tipo de consignación" options={opciones.tipo_consignacion ?? []} />
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
