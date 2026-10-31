import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { User, Phone, Mail, Tag, Plus, Car, ArrowLeftRight, ChevronDown, CheckSquare, Bell } from 'lucide-react'
import Input from '@/components/common/Input'
import Select from '@/components/common/Select'
import DatePicker from '@/components/common/DatePicker'
import Button from '@/components/common/Button'
import GlassCard from '@/components/common/GlassCard'
import LeadVehiculos from '@/components/crm/LeadVehiculos'
import { CANAL_OPCIONES } from '@/crm/lib/formatCliente'
import { useClienteMutations } from '@/crm/hooks/useClientes'
import { useTareaMutations } from '@/crm/hooks/useTareas'
import { useAlertaMutations } from '@/crm/hooks/useAlertas'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import { useCrmUsuarios } from '@/crm/hooks/useCrmUsuarios'
import { TareaCampos, AlertaCampos } from '@/components/crm/LeadSeguimiento'
import { tareaVacia, alertaVacia, validarSeguimiento, usuariosAsignables } from '@/lib/leadSeguimiento'

// Origen del lead = canal del cliente: mismas opciones que el filtro de Clientes.
const SOURCE_OPTIONS = CANAL_OPCIONES

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
  const { crearCompleto } = useClienteMutations()
  const isPending = crearCompleto.isPending
  const { crear: crearTarea } = useTareaMutations()
  const { crear: crearAlerta } = useAlertaMutations()
  const { id: miId } = useCrmPerfil()
  const { data: usuarios = [] } = useCrmUsuarios()
  const asignables = usuariosAsignables(usuarios, miId)
  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { source: 'salon', contact_date: todayStr() } })

  const emailLocal = (watch('email') || '').split('@')[0]

  // Vehículos de interés y en entrega: listas locales (puede haber varios).
  const [intereses, setIntereses] = useState([])
  const [entrega, setEntrega] = useState([])
  const [verIntereses, setVerIntereses] = useState(false)
  const [verEntrega, setVerEntrega] = useState(false)
  // Una tarea y una alerta opcionales, que quedan vinculadas al lead nuevo.
  const [tarea, setTarea] = useState(tareaVacia)
  const [alerta, setAlerta] = useState(alertaVacia)
  const [verTarea, setVerTarea] = useState(false)
  const [verAlerta, setVerAlerta] = useState(false)

  const limpiar = () => {
    reset({ source: 'salon', contact_date: todayStr() })
    setIntereses([])
    setEntrega([])
    setVerIntereses(false)
    setVerEntrega(false)
    setTarea(tareaVacia())
    setAlerta(alertaVacia())
    setVerTarea(false)
    setVerAlerta(false)
  }

  const onSubmit = async (values) => {
    const hayTarea = Boolean(tarea.titulo.trim())
    const hayAlerta = Boolean(alerta.titulo.trim())
    const error = validarSeguimiento(tarea, alerta)
    if (error) {
      toast.error(error)
      return
    }
    // Cliente + sus vehículos de interés/entrega. Si falla, el hook ya avisó.
    let cliente
    try {
      cliente = await crearCompleto.mutateAsync({
        nombre: values.full_name.trim(),
        telefono: values.phone,
        email: values.email || null,
        canal: values.source,
        notas: values.notes || null,
        // Fecha de contacto distinta de hoy: queda como fecha de alta.
        ...(values.contact_date && values.contact_date !== todayStr()
          ? { creado_en: `${values.contact_date}T12:00:00-03:00` }
          : {}),
        intereses,
        autos_entrega: entrega,
      })
    } catch {
      return
    }
    // El cliente ya existe: si la tarea o la alerta fallan, el hook avisa y se sigue.
    toast.success('Cliente registrado con éxito')
    if (hayTarea || hayAlerta) {
      if (!miId) {
        toast.error('Tu usuario no tiene perfil de CRM: no se pudo cargar la tarea/alerta.')
      } else {
        if (hayTarea) {
          await crearTarea
            .mutateAsync({
              titulo: tarea.titulo.trim(),
              fecha: tarea.fecha,
              hora: tarea.hora || null,
              prioridad: tarea.prioridad,
              asignado_a: tarea.asignado_a || miId,
              cliente_id: cliente.id,
            })
            .catch(() => {})
        }
        if (hayAlerta) {
          await crearAlerta
            .mutateAsync({
              titulo: alerta.titulo.trim(),
              fecha: alerta.fecha,
              hora: alerta.hora,
              asignado_a: alerta.asignado_a || miId,
              cliente_id: cliente.id,
            })
            .catch(() => {})
        }
      }
    }
    limpiar()
  }

  return (
    <GlassCard className="p-6 md:p-8">
      <h2 className="font-display text-xl font-bold text-ink">Registrar Nuevo Cliente</h2>
      <p className="mt-1 text-sm text-ink-2">
        Ingresá los datos del cliente o consulta recibida.
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
          <CampoDesplegable
            label="Tarea"
            icon={CheckSquare}
            abierto={verTarea}
            cantidad={tarea.titulo.trim() ? 1 : 0}
            onToggle={() => setVerTarea((v) => !v)}
          />
          <CampoDesplegable
            label="Alerta"
            icon={Bell}
            abierto={verAlerta}
            cantidad={alerta.titulo.trim() ? 1 : 0}
            onToggle={() => setVerAlerta((v) => !v)}
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
          {verTarea && <TareaCampos value={tarea} onChange={setTarea} usuarios={asignables} miId={miId} />}
          {verAlerta && <AlertaCampos value={alerta} onChange={setAlerta} usuarios={asignables} miId={miId} />}
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
            {isPending ? 'Registrando…' : 'Registrar Cliente'}
          </Button>
        </div>
      </form>
    </GlassCard>
  )
}
