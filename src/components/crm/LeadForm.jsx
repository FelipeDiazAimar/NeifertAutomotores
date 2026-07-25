import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { User, Phone, Mail, Car, Tag, Plus } from 'lucide-react'
import Input from '@/components/common/Input'
import Select from '@/components/common/Select'
import DatePicker from '@/components/common/DatePicker'
import Button from '@/components/common/Button'
import GlassCard from '@/components/common/GlassCard'
import { LEAD_SOURCES } from '@/lib/constants'
import { useCreateLead } from '@/hooks/useLeads'

// Mismas opciones/etiquetas que el filtro por origen y la columna "Origen"
// del listado — un solo lugar (LEAD_SOURCES) para no desalinear nombres.
const SOURCE_OPTIONS = LEAD_SOURCES.map((s) => ({ id: s, label: s }))

const todayStr = () => format(new Date(), 'yyyy-MM-dd')

// Dominios de correo más comunes entre clientes — se sugieren como chips
// para completar el email con un toque, sin obligar a tipearlo entero.
const EMAIL_DOMAINS = ['gmail.com', 'hotmail.com']

const schema = z.object({
  full_name: z.string().min(2, 'Ingresá el nombre completo'),
  phone: z.string().min(6, 'Teléfono inválido'),
  email: z.union([z.string().email('Email inválido'), z.literal('')]).optional(),
  vehicle_interest: z.string().optional(),
  source: z.string().min(1),
  contact_date: z.string().optional(),
  notes: z.string().optional(),
})

export default function LeadForm() {
  const { mutateAsync, isPending } = useCreateLead()
  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { source: 'Web', contact_date: todayStr() } })

  const emailLocal = (watch('email') || '').split('@')[0]

  const onSubmit = async (values) => {
    await mutateAsync({ ...values, email: values.email || null })
    reset({ source: 'Web', contact_date: todayStr() })
  }

  return (
    <GlassCard className="p-6 md:p-8">
      <h2 className="font-display text-xl font-bold text-ink">Registrar Nuevo Lead</h2>
      <p className="mt-1 text-sm text-ink-2">
        Ingresá los datos del cliente potencial recibido en el salón.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Input
            label="Nombre completo"
            icon={User}
            placeholder="Ej. Juan Pérez"
            error={errors.full_name?.message}
            {...register('full_name')}
          />
          <Input
            label="Teléfono"
            icon={Phone}
            placeholder="+54 9 11 1234 5678"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <div>
            <Input
              label="Email"
              icon={Mail}
              placeholder="juan.perez@email.com"
              error={errors.email?.message}
              {...register('email')}
            />
            {emailLocal && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {EMAIL_DOMAINS.map((domain) => (
                  <button
                    key={domain}
                    type="button"
                    onClick={() =>
                      setValue('email', `${emailLocal}@${domain}`, {
                        shouldValidate: true,
                        shouldDirty: true,
                      })
                    }
                    className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-ink-2 transition-colors hover:border-neifert hover:text-neifert"
                  >
                    @{domain}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Input
            label="Vehículo de interés"
            icon={Car}
            placeholder="Ej. Audi A4 2023"
            {...register('vehicle_interest')}
          />
          <Controller
            name="source"
            control={control}
            render={({ field }) => (
              <Select
                label="Origen del lead"
                icon={Tag}
                options={SOURCE_OPTIONS}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            name="contact_date"
            control={control}
            render={({ field }) => (
              <DatePicker label="Fecha de contacto" value={field.value} onChange={field.onChange} />
            )}
          />
        </div>

        <Input
          as="textarea"
          label="Notas y requerimientos específicos"
          placeholder="Detalles sobre permuta, plan de financiación o preferencias de color…"
          {...register('notes')}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={() => reset({ source: 'Web', contact_date: todayStr() })}>
            Cancelar
          </Button>
          <Button type="submit" icon={Plus} disabled={isPending}>
            {isPending ? 'Registrando…' : 'Registrar Lead'}
          </Button>
        </div>
      </form>
    </GlassCard>
  )
}
