import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLenis } from 'lenis/react'
import { X } from 'lucide-react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import Select from '@/components/common/Select'
import { alertaSchema } from '@/crm/lib/alertaSchema'
import { useAlertaMutations } from '@/crm/hooks/useAlertas'
import { usePushNotifications } from '@/crm/hooks/usePushNotifications'
import { obtenerMiPerfil } from '@/crm/services/crmUsuarios.service'
import { guardarMiEmail } from '@/crm/services/usuarios.service'
import { useCrmUsuarios } from '@/crm/hooks/useCrmUsuarios'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import { useClientes } from '@/crm/hooks/useClientes'
import { useVehiculos } from '@/crm/hooks/useVehiculos'

const hoy = () => new Date().toISOString().slice(0, 10)

function useLockScroll(open, onClose) {
  const lenis = useLenis()
  useEffect(() => {
    if (!open) return
    lenis?.stop()
    const { documentElement: html, body } = document
    const ancho = window.innerWidth - html.clientWidth
    const previo = {
      h: html.style.overflow,
      b: body.style.overflow,
      p: body.style.paddingRight,
    }
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

export default function AlertaFormModal({
  open,
  onClose,
  alerta,
  clienteFijo,
  onGuardado,
}) {
  useLockScroll(open, onClose)
  const { crear, actualizar } = useAlertaMutations()
  const { activar } = usePushNotifications()
  const [pasoEmail, setPasoEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [errorEmail, setErrorEmail] = useState('')
  const [guardandoEmail, setGuardandoEmail] = useState(false)
  const { data: usuarios = [] } = useCrmUsuarios()
  const { id: miId } = useCrmPerfil()
  const { data: clientesData } = useClientes({ pageSize: 500 })
  const { data: vehData } = useVehiculos({
    filtros: { estado: ['disponible'] },
    pageSize: 300,
  })

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(alertaSchema),
    defaultValues: {
      titulo: '',
      descripcion: '',
      fecha: hoy(),
      hora: '09:00',
      asignado_a: miId ?? '',
      cliente_id: clienteFijo ?? '',
      vehiculo_id: '',
      ...alerta,
    },
  })

  // Reset cuando cambia la alerta o se abre para alta. (pasoEmail/email se
  // resetean en cerrarTodo, único camino de salida del modal.)
  useEffect(() => {
    if (!open) return
    reset({
      titulo: '',
      descripcion: '',
      fecha: hoy(),
      hora: '09:00',
      asignado_a: miId ?? '',
      cliente_id: clienteFijo ?? '',
      vehiculo_id: '',
      ...alerta,
    })
  }, [open, alerta, clienteFijo, miId, reset])

  const clienteOpts = [
    { id: '', label: '— Sin cliente —' },
    ...(clientesData?.filas ?? []).map((c) => ({ id: c.id, label: c.nombre })),
  ]
  const vehOpts = [
    { id: '', label: '— Sin vehículo —' },
    ...(vehData?.filas ?? []).map((v) => ({ id: v.id, label: `${v.marca} ${v.modelo}` })),
  ]

  function submit(data) {
    // Los flags de aviso nunca salen del formulario: solo se resetean acá
    // cuando corresponde (vienen en `data` por el ...alerta de defaultValues).
    const { notificado_push: _np, notificado_email: _ne, ...form } = data
    const limpio = {
      ...form,
      cliente_id: form.cliente_id || null,
      vehiculo_id: form.vehiculo_id || null,
      descripcion: form.descripcion || null,
    }
    const done = async (asignado) => {
      // Si la alerta NO es para mí, cierro como antes: no hay nada que pedir.
      if (!asignado || asignado !== miId) {
        onClose()
        onGuardado?.()
        return
      }
      // Si es para mí, pido el permiso del navegador acá mismo: sin
      // suscripción push no hay a dónde enviar el aviso. Y si no tengo email,
      // lo pido antes para que también llegue por correo.
      try {
        const perfil = await obtenerMiPerfil(miId)
        if (perfil?.email) {
          onClose()
          onGuardado?.()
          activar()
          return
        }
      } catch {
        // Si no se pudo verificar, igual pido el permiso push.
        onClose()
        onGuardado?.()
        activar()
        return
      }
      setEmail('')
      setErrorEmail('')
      setPasoEmail(true)
    }
    if (alerta?.id) {
      // Si se reprograma (fecha/hora) o cambia de destinatario, el aviso
      // vuelve a estar pendiente para que salga a la nueva hora/persona.
      if (
        form.fecha !== alerta.fecha ||
        form.hora !== alerta.hora ||
        form.asignado_a !== alerta.asignado_a
      ) {
        limpio.notificado_push = false
        limpio.notificado_email = false
      }
      actualizar.mutate(
        { id: alerta.id, data: limpio },
        { onSuccess: () => done(form.asignado_a) }
      )
    } else crear.mutate(limpio, { onSuccess: () => done(form.asignado_a) })
  }

  const guardando = crear.isPending || actualizar.isPending

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  function cerrarTodo() {
    setPasoEmail(false)
    setEmail('')
    setErrorEmail('')
    onClose()
  }

  async function guardarEmailYActivar(e) {
    e.preventDefault()
    const limpio = email.trim()
    if (!EMAIL_RE.test(limpio)) return setErrorEmail('Ingresá un email válido.')
    setGuardandoEmail(true)
    try {
      await guardarMiEmail(limpio)
      cerrarTodo()
      onGuardado?.()
      activar()
    } catch (err) {
      setErrorEmail(err.message || 'No se pudo guardar el email.')
    } finally {
      setGuardandoEmail(false)
    }
  }

  function omitirEmail() {
    cerrarTodo()
    onGuardado?.()
    activar()
  }

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
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-md"
            onClick={cerrarTodo}
          />
          <div className="relative flex min-h-full items-start justify-center p-4 sm:p-6">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={alerta?.id ? 'Editar alerta' : 'Nueva alerta'}
              className="glass shadow-glass relative z-10 my-4 w-full max-w-lg rounded-[20px] p-6"
              initial={{ scale: 0.96, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, y: 8 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-ink text-lg font-bold">
                  {pasoEmail
                    ? 'Tu email para las alertas'
                    : alerta?.id
                      ? 'Editar alerta'
                      : 'Nueva alerta'}
                </h2>
                <button
                  onClick={cerrarTodo}
                  aria-label="Cerrar"
                  className="text-ink-3 hover:bg-surface hover:text-ink grid h-8 w-8 place-items-center rounded-full"
                >
                  <X size={18} />
                </button>
              </div>

              {pasoEmail ? (
                <form onSubmit={guardarEmailYActivar} className="space-y-3">
                  <p className="text-ink-3 text-sm">
                    Todavía no tenés un email cargado. Lo usamos para avisarte por correo
                    además de la notificación en pantalla.
                  </p>
                  <Input
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="empleado@neifertautomotores.com"
                    error={errorEmail}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={omitirEmail}>
                      Omitir
                    </Button>
                    <Button type="submit" disabled={guardandoEmail}>
                      {guardandoEmail ? 'Guardando…' : 'Guardar y activar'}
                    </Button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleSubmit(submit)} className="space-y-3">
                  <Input
                    label="Título"
                    {...register('titulo')}
                    error={errors.titulo?.message}
                  />
                  <Input as="textarea" label="Descripción" {...register('descripcion')} />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Vence"
                      type="date"
                      {...register('fecha')}
                      error={errors.fecha?.message}
                    />
                    <Input
                      label="Hora"
                      type="time"
                      {...register('hora')}
                      error={errors.hora?.message}
                    />
                  </div>
                  <p className="text-ink-3 text-xs">
                    Te avisamos por notificación y email justo a esta hora.
                  </p>
                  <Controller
                    control={control}
                    name="asignado_a"
                    render={({ field }) => (
                      <Select
                        label="Asignado a"
                        options={usuarios.map((u) => ({ id: u.id, label: u.nombre }))}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        error={errors.asignado_a?.message}
                      />
                    )}
                  />

                  {!clienteFijo && (
                    <Controller
                      control={control}
                      name="cliente_id"
                      render={({ field }) => (
                        <Select
                          label="Cliente"
                          options={clienteOpts}
                          value={field.value ?? ''}
                          onChange={field.onChange}
                        />
                      )}
                    />
                  )}
                  <Controller
                    control={control}
                    name="vehiculo_id"
                    render={({ field }) => (
                      <Select
                        label="Vehículo"
                        options={vehOpts}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                      />
                    )}
                  />

                  <div className="flex justify-end pt-1">
                    <Button type="submit" disabled={guardando}>
                      {guardando ? 'Guardando…' : 'Guardar'}
                    </Button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
