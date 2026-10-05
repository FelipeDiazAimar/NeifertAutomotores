import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { User, Phone, Mail, Tag, Plus, Car, ArrowLeftRight, ChevronDown } from 'lucide-react'
import Input from '@/components/common/Input'
import Select from '@/components/common/Select'
import DatePicker from '@/components/common/DatePicker'
import Button from '@/components/common/Button'
import GlassCard from '@/components/common/GlassCard'
import LeadVehiculos from '@/components/crm/LeadVehiculos'
import { resumenIntereses } from '@/services/leads.service'
import { LEAD_SOURCES } from '@/lib/constants'
import { useCreateLead } from '@/hooks/useLeads'

// Mismas opciones/etiquetas que el filtro por origen y la columna "Origen"
// del listado — un solo lugar (LEAD_SOURCES) para no desalinear nombres.
const SOURCE_OPTIONS = LEAD_SOURCES.map((s) => ({ id: s, label: s }))

/** Disparador con la misma pinta que los demás inputs del formulario:
 *  muestra cuántos vehículos van cargados y despliega la card de carga. */
function CampoDesplegable({ label, icon: Icon, abierto, cantidad, onToggle }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        className="glass field-glass flex h-12 w-full items-center gap-2.5 rounded-2xl px-3.5 text-left text-sm transition-colors"
      >
        {Icon && <Icon size={17} className="shrink-0 text-ink-3" />}
        <span className="flex-1 truncate text-ink">
          {cantidad > 0 ? `${cantidad} cargado${cantidad === 1 ? '' : 's'}` : 'Agregar…'}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-ink-3 transition-transform ${abierto ? 'rotate-180' : ''}`}
        />
      </button>
    </div>
  )
}

const todayStr = () => format(new Date(), 'yyyy-MM-dd')

// Dominios de correo más comunes entre clientes — se sugieren como chips
// para completar el email con un toque, sin obligar a tipearlo entero.
const EMAIL_DOMAINS = ['gmail.com', 'hotmail.com']

const schema = z.object({
  full_name: z.string().min(2, 'Ingresá el nombre completo'),
  phone: z.string().min(6, 'Teléfono inválido'),
  email: z.union([z.string().email('Email inválido'), z.literal('')]).optional(),
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

  // Vehículos de interés y en entrega: listas locales (puede haber varios).
  const [intereses, setIntereses] = useState([])
  const [entrega, setEntrega] = useState([])
  const [verIntereses, setVerIntereses] = useState(false)
  const [verEntrega, setVerEntrega] = useState(false)

  const limpiar = () => {
    reset({ source: 'Web', contact_date: todayStr() })
    setIntereses([])
    setEntrega([])
    setVerIntereses(false)
    setVerEntrega(false)
  }

  const onSubmit = async (values) => {
    await mutateAsync({
      ...values,
      email: values.email || null,
      vehiculos_interes: intereses,
      autos_entrega: entrega,
      // El campo viejo de texto se deriva del resumen para que la búsqueda
      // del listado y la tabla sigan funcionando.
      vehicle_interest: resumenIntereses(intereses) || null,
    })
    limpiar()
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
          <CampoDesplegable
            label="Vehículos de interés"
            icon={Car}
            abierto={verIntereses}
            cantidad={intereses.length}
            onToggle={() => setVerIntereses((v) => !v)}
          />
          <CampoDesplegable
            label="Autos en entrega"
            icon={ArrowLeftRight}
            abierto={verEntrega}
            cantidad={entrega.length}
            onToggle={() => setVerEntrega((v) => !v)}
          />
        </div>

        <div className="space-y-4">
          {verIntereses && (
          <div className="rounded-2xl border border-line bg-surface/50 p-4 md:p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neifert/15 text-neifert">
                <Car size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-bold text-ink">Vehículos de interés</p>
                <p className="truncate text-xs text-ink-3">
                  Lo que el cliente busca — marcá si es usado o cero km
                </p>
              </div>
              {intereses.length > 0 && (
                <span className="shrink-0 rounded-full bg-neifert px-2.5 py-0.5 text-xs font-bold text-white">
                  {intereses.length}
                </span>
              )}
            </div>
            <LeadVehiculos
              items={intereses}
              botonPropio={false}
              abierto={verIntereses}
              onCambiarAbierto={setVerIntereses}
              emptyText="Todavía no agregaste vehículos de interés."
              onAgregar={(item) => setIntereses((prev) => [...prev, item])}
              onQuitar={(i) => setIntereses((prev) => prev.filter((_, j) => j !== i))}
            />
          </div>
          )}
          {verEntrega && (
          <div className="rounded-2xl border border-line bg-surface/50 p-4 md:p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber/15 text-amber">
                <ArrowLeftRight size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-bold text-ink">Autos en entrega</p>
                <p className="truncate text-xs text-ink-3">
                  Lo que el cliente deja en parte de pago o permuta
                </p>
              </div>
              {entrega.length > 0 && (
                <span className="shrink-0 rounded-full bg-amber px-2.5 py-0.5 text-xs font-bold text-white">
                  {entrega.length}
                </span>
              )}
            </div>
            <LeadVehiculos
              items={entrega}
              botonPropio={false}
              abierto={verEntrega}
              onCambiarAbierto={setVerEntrega}
              emptyText="Sin autos en entrega."
              onAgregar={(item) => setEntrega((prev) => [...prev, item])}
              onQuitar={(i) => setEntrega((prev) => prev.filter((_, j) => j !== i))}
            />
          </div>
          )}
        </div>

        <Input
          as="textarea"
          label="Notas y requerimientos específicos"
          placeholder="Detalles sobre permuta, plan de financiación o preferencias de color…"
          {...register('notes')}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={limpiar}>
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
