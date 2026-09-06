import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLenis } from 'lenis/react'
import { X } from 'lucide-react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import Select from '@/components/common/Select'
import { tareaSchema } from '@/crm/lib/tareaSchema'
import { useTareaMutations } from '@/crm/hooks/useTareas'
import { useCrmUsuarios } from '@/crm/hooks/useCrmUsuarios'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import { useClientes } from '@/crm/hooks/useClientes'
import { useVehiculos } from '@/crm/hooks/useVehiculos'

const PRIORIDADES = [
  { id: 'baja', label: 'Baja' },
  { id: 'normal', label: 'Normal' },
  { id: 'alta', label: 'Alta' },
]
const hoy = () => new Date().toISOString().slice(0, 10)

function useLockScroll(open, onClose) {
  const lenis = useLenis()
  useEffect(() => {
    if (!open) return
    lenis?.stop()
    const { documentElement: html, body } = document
    const ancho = window.innerWidth - html.clientWidth
    const previo = { h: html.style.overflow, b: body.style.overflow, p: body.style.paddingRight }
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    if (ancho > 0) body.style.paddingRight = `${ancho}px`
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => {
      lenis?.start()
      html.style.overflow = previo.h
      body.style.overflow = previo.b
      body.style.paddingRight = previo.p
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, lenis])
}

export default function TareaFormModal({ open, onClose, tarea, clienteFijo, onGuardado }) {
  useLockScroll(open, onClose)
  const { crear, actualizar } = useTareaMutations()
  const { data: usuarios = [] } = useCrmUsuarios()
  const { id: miId } = useCrmPerfil()
  const { data: clientesData } = useClientes({ pageSize: 500 })
  const { data: vehData } = useVehiculos({ filtros: { estado: ['disponible'] }, pageSize: 300 })

  const {
    register, handleSubmit, control, reset, formState: { errors },
  } = useForm({
    resolver: zodResolver(tareaSchema),
    defaultValues: {
      titulo: '', descripcion: '', fecha: hoy(), hora: '', prioridad: 'normal',
      asignado_a: miId ?? '', cliente_id: clienteFijo ?? '', vehiculo_id: '',
      ...tarea,
    },
  })

  // Reset cuando cambia la tarea o se abre para alta.
  useEffect(() => {
    if (!open) return
    reset({
      titulo: '', descripcion: '', fecha: hoy(), hora: '', prioridad: 'normal',
      asignado_a: miId ?? '', cliente_id: clienteFijo ?? '', vehiculo_id: '',
      ...tarea,
    })
  }, [open, tarea, clienteFijo, miId, reset])

  const clienteOpts = [
    { id: '', label: '— Sin cliente —' },
    ...(clientesData?.filas ?? []).map((c) => ({ id: c.id, label: c.nombre })),
  ]
  const vehOpts = [
    { id: '', label: '— Sin vehículo —' },
    ...(vehData?.filas ?? []).map((v) => ({ id: v.id, label: `${v.marca} ${v.modelo}` })),
  ]

  function submit(data) {
    const limpio = {
      ...data,
      cliente_id: data.cliente_id || null,
      vehiculo_id: data.vehiculo_id || null,
      asignado_a: data.asignado_a || null,
      hora: data.hora || null,
      descripcion: data.descripcion || null,
    }
    const done = () => {
      onClose()
      onGuardado?.()
    }
    if (tarea?.id) actualizar.mutate({ id: tarea.id, data: limpio }, { onSuccess: done })
    else crear.mutate(limpio, { onSuccess: done })
  }

  const guardando = crear.isPending || actualizar.isPending

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          data-lenis-prevent
          className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
          <div className="relative flex min-h-full items-start justify-center p-4 sm:p-6">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={tarea?.id ? 'Editar tarea' : 'Nueva tarea'}
              className="glass relative z-10 my-4 w-full max-w-lg rounded-[20px] p-6 shadow-glass"
              initial={{ scale: 0.96, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, y: 8 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-ink">
                  {tarea?.id ? 'Editar tarea' : 'Nueva tarea'}
                </h2>
                <button onClick={onClose} aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-full text-ink-3 hover:bg-surface hover:text-ink">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit(submit)} className="space-y-3">
                <Input label="Título" {...register('titulo')} error={errors.titulo?.message} />
                <Input as="textarea" label="Descripción" {...register('descripcion')} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Vence" type="date" {...register('fecha')} error={errors.fecha?.message} />
                  <Input label="Hora" type="time" {...register('hora')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Controller
                    control={control} name="prioridad"
                    render={({ field }) => (
                      <Select label="Prioridad" options={PRIORIDADES} value={field.value} onChange={field.onChange} />
                    )}
                  />
                  <Controller
                    control={control} name="asignado_a"
                    render={({ field }) => (
                      <Select
                        label="Asignado a"
                        options={usuarios.map((u) => ({ id: u.id, label: u.nombre }))}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </div>

                {!clienteFijo && (
                  <Controller
                    control={control} name="cliente_id"
                    render={({ field }) => (
                      <Select label="Cliente" options={clienteOpts} value={field.value ?? ''} onChange={field.onChange} />
                    )}
                  />
                )}
                <Controller
                  control={control} name="vehiculo_id"
                  render={({ field }) => (
                    <Select label="Vehículo" options={vehOpts} value={field.value ?? ''} onChange={field.onChange} />
                  )}
                />

                <div className="flex justify-end pt-1">
                  <Button type="submit" disabled={guardando}>
                    {guardando ? 'Guardando…' : 'Guardar'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
