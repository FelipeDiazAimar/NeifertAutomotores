import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import MilesInput from '@/components/common/MilesInput'
import Select from '@/components/common/Select'
import Combobox from '@/crm/components/Combobox'
import { useOpcionesCampo } from '@/crm/hooks/useOpcionesCampo'
import { CAMPOS as CAMPOS_COMBO } from '@/crm/services/opcionesCampo.service'
import { vehiculoSchema } from '@/crm/lib/vehiculoSchema'
import { slugify, useSiteStore } from '@/store/useSiteStore'

// Semilla para "Tipo / Categoría" — se fusiona con las categorías de
// /admin/contenido y con lo ya cargado en la base. Un solo campo que
// sirve para las 2 cosas: `tipo` (CRM/leads) y `categoria` (web).
const TIPOS = [
  'Pickup',
  'Sedan',
  'SUV',
  'Hatchback',
  'Utilitario',
  'Coupé',
  'Familiar',
  'Otro',
]
const COMBUSTIBLES_SEED = ['Nafta', 'Diésel', 'GNC', 'Híbrido', 'Eléctrico']
const TRANS_SEED = ['manual', 'automático']
// Historial real: spec "propio | consignación | ..." + fixtures con
// origen="propio", tipoConsignacion="fisica".
const ORIGENES_SEED = ['propio', 'consignación', 'canje']
const TIPO_CONSIG_SEED = ['fisica', 'virtual']

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
      <legend className="font-display text-ink text-sm font-bold">{titulo}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

function Check({ name, label, register }) {
  return (
    <label className="text-ink-2 flex items-center gap-2 text-sm">
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
  const categories = useSiteStore((s) => s.categories)
  const fuelTypes = useSiteStore((s) => s.fuelTypes)
  const transmissions = useSiteStore((s) => s.transmissions)
  const addFuelType = useSiteStore((s) => s.addFuelType)
  const addTransmission = useSiteStore((s) => s.addTransmission)
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(vehiculoSchema),
    defaultValues: {
      moneda: 'ARS',
      consignacion: false,
      carpeta_completa: false,
      carpeta_con_oficio: false,
      carpeta_entregada: false,
      tiene_iva: false,
      ...inicial,
      // Backfill: si viene categoria vieja sin tipo, mostrarla como tipo.
      tipo:
        inicial?.tipo ||
        categories.find((c) => c.id === inicial?.categoria)?.label ||
        inicial?.categoria ||
        '',
    },
  })

  const opcionesTipo = conSemilla(
    [...TIPOS, ...categories.map((c) => c.label)],
    opciones.tipo
  )
  const opcionesCombustible = conSemilla(fuelTypes, [
    ...COMBUSTIBLES_SEED,
    ...(opciones.combustible ?? []),
  ])
  const opcionesTransmision = conSemilla(transmissions, [
    ...TRANS_SEED,
    ...(opciones.transmision ?? []),
  ])
  const opcionesOrigen = conSemilla(opciones.origen, ORIGENES_SEED)
  const opcionesTipoConsig = conSemilla(opciones.tipo_consignacion, TIPO_CONSIG_SEED)

  // Antes de guardar, persiste los valores tipeados que no estaban en la lista.
  // `tipo` se duplica en `categoria` (slug) para que sirva al CRM y a la web.
  const submit = (data) => {
    const tipoLimpio = (data.tipo ?? '').trim()
    const dataUnificada = {
      ...data,
      tipo: tipoLimpio || undefined,
      categoria: tipoLimpio ? slugify(tipoLimpio) : undefined,
    }
    const nuevas = CAMPOS_COMBO.flatMap((campo) => {
      const v = (dataUnificada[campo] ?? '').trim()
      if (!v) return []
      const conocidas =
        campo === 'tipo'
          ? opcionesTipo
          : campo === 'origen'
            ? opcionesOrigen
            : campo === 'tipo_consignacion'
              ? opcionesTipoConsig
              : (opciones[campo] ?? [])
      const yaEsta = conocidas.some((o) => o.toLowerCase() === v.toLowerCase())
      return yaEsta ? [] : [{ campo, valor: v }]
    })
    registrarNuevas(nuevas)
    // Combustible/transmisión viven en el store de contenido: si es nuevo, agregarlo.
    const comb = (dataUnificada.combustible ?? '').trim()
    if (comb && !opcionesCombustible.some((o) => o.toLowerCase() === comb.toLowerCase()))
      addFuelType(comb)
    const trans = (dataUnificada.transmision ?? '').trim()
    if (
      trans &&
      !opcionesTransmision.some((o) => o.toLowerCase() === trans.toLowerCase())
    )
      addTransmission(trans)
    onGuardar(dataUnificada)
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-6">
      <Seccion titulo="Datos">
        <CampoCombo
          control={control}
          name="marca"
          label="Marca"
          options={opciones.marca ?? []}
        />
        <CampoCombo
          control={control}
          name="modelo"
          label="Modelo"
          options={opciones.modelo ?? []}
        />
        <CampoCombo
          control={control}
          name="version"
          label="Versión"
          options={opciones.version ?? []}
        />
        <CampoCombo
          control={control}
          name="tipo"
          label="Tipo / Categoría"
          options={opcionesTipo}
        />
        <Input
          label="Año"
          type="number"
          {...register('anio')}
          error={errors.anio?.message}
        />
        <MilesInput control={control} name="km" label="Km" />
        <CampoCombo
          control={control}
          name="transmision"
          label="Transmisión"
          options={opcionesTransmision}
        />
        <CampoCombo
          control={control}
          name="color"
          label="Color"
          options={opciones.color ?? []}
        />
        <Input label="Patente" {...register('patente')} />
      </Seccion>

      <Seccion titulo="Precio">
        <Controller
          control={control}
          name="moneda"
          render={({ field }) => (
            <Select
              label="Moneda"
              options={[
                { id: 'ARS', label: 'ARS' },
                { id: 'USD', label: 'USD' },
              ]}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <span />
        <MilesInput control={control} name="precio_contado" label="Precio contado" />
        <MilesInput control={control} name="precio_canje" label="Precio en canje" />
      </Seccion>

      <Seccion titulo="Dueño">
        <Input label="Nombre" {...register('duenio_nombre')} />
        <Input label="Apellido" {...register('duenio_apellido')} />
        <Input label="Contacto" {...register('duenio_contacto')} />
      </Seccion>

      <Seccion titulo="Documentación">
        <Controller
          control={control}
          name="itv"
          render={({ field }) => (
            <Select
              label="ITV"
              options={[
                { id: 'si', label: 'Sí' },
                { id: 'no', label: 'No' },
              ]}
              value={field.value ?? ''}
              onChange={field.onChange}
            />
          )}
        />
        <Input label="Vencimiento ITV" type="date" {...register('itv_venc')} />
        <CampoCombo
          control={control}
          name="origen"
          label="Origen"
          options={opcionesOrigen}
        />
        <CampoCombo
          control={control}
          name="tipo_consignacion"
          label="Tipo de consignación"
          options={opcionesTipoConsig}
        />
        <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2">
          <Check name="consignacion" label="En consignación" register={register} />
          <Check name="carpeta_completa" label="Carpeta completa" register={register} />
          <Check
            name="carpeta_con_oficio"
            label="Carpeta con oficio"
            register={register}
          />
          <Check name="carpeta_entregada" label="Carpeta entregada" register={register} />
          <Check name="tiene_iva" label="Tiene IVA" register={register} />
        </div>
      </Seccion>

      <Seccion titulo="Nota">
        <div className="sm:col-span-2">
          <Input as="textarea" {...register('nota')} />
        </div>
      </Seccion>

      <Seccion titulo="Publicación en la web">
        <CampoCombo
          control={control}
          name="combustible"
          label="Combustible"
          options={opcionesCombustible}
        />
        <div className="sm:col-span-2">
          <Input
            as="textarea"
            label="Descripción (para la web)"
            {...register('descripcion')}
          />
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
