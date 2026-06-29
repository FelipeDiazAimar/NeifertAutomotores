import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { User, Phone, Mail, Car, Tag, Calendar, Plus } from 'lucide-react'
import Input from '@/components/common/Input'
import Button from '@/components/common/Button'
import GlassCard from '@/components/common/GlassCard'
import { LEAD_SOURCES } from '@/lib/constants'
import { useCreateLead } from '@/hooks/useLeads'

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
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { source: 'Web' } })

  const onSubmit = async (values) => {
    await mutateAsync({ ...values, email: values.email || null })
    reset({ source: 'Web' })
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
          <Input
            label="Email"
            icon={Mail}
            placeholder="juan.perez@email.com"
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Vehículo de interés"
            icon={Car}
            placeholder="Ej. Audi A4 2023"
            {...register('vehicle_interest')}
          />
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-3">
              Origen del lead
            </span>
            <div className="glass flex h-12 items-center gap-2.5 rounded-2xl px-3.5 focus-within:border-neifert">
              <Tag size={17} className="shrink-0 text-ink-3" />
              <select
                {...register('source')}
                className="w-full bg-transparent text-sm text-ink outline-none"
              >
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s} className="bg-surface-solid text-ink">
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <Input label="Fecha de contacto" type="date" icon={Calendar} {...register('contact_date')} />
        </div>

        <Input
          as="textarea"
          label="Notas y requerimientos específicos"
          placeholder="Detalles sobre permuta, plan de financiación o preferencias de color…"
          {...register('notes')}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={() => reset({ source: 'Web' })}>
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
