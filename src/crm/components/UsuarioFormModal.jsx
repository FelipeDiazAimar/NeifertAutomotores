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
import { ROL_LABEL } from '@/crm/lib/vistas'
import { crearUsuarioSchema } from '@/crm/lib/usuarioSchema'
import { useUsuarioMutations } from '@/crm/hooks/useUsuarios'

const ROL_OPCIONES = Object.entries(ROL_LABEL).map(([id, label]) => ({ id, label }))

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

export default function UsuarioFormModal({ open, onClose }) {
  useLockScroll(open, onClose)
  const { crearUsuario } = useUsuarioMutations()

  const {
    register, handleSubmit, control, reset, formState: { errors },
  } = useForm({
    resolver: zodResolver(crearUsuarioSchema),
    defaultValues: { usuario: '', nombre: '', rol: 'vendedor', password: '' },
  })

  useEffect(() => {
    if (open) reset({ usuario: '', nombre: '', rol: 'vendedor', password: '' })
  }, [open, reset])

  function submit(data) {
    crearUsuario.mutate(data, { onSuccess: onClose })
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
          <div className="relative flex min-h-full items-start justify-center p-4 sm:p-6">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Nuevo usuario"
              className="glass relative z-10 my-4 w-full max-w-md rounded-[20px] p-6 shadow-glass"
              initial={{ scale: 0.96, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, y: 8 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-ink">Nuevo usuario</h2>
                <button onClick={onClose} aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-full text-ink-3 hover:bg-surface hover:text-ink">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit(submit)} className="space-y-3">
                <Input label="Usuario" {...register('usuario')} error={errors.usuario?.message} />
                <Input label="Nombre" {...register('nombre')} error={errors.nombre?.message} />
                <Controller
                  control={control}
                  name="rol"
                  render={({ field }) => (
                    <Select label="Rol" options={ROL_OPCIONES} value={field.value} onChange={field.onChange} />
                  )}
                />
                <Input label="Contraseña" type="text" {...register('password')} error={errors.password?.message} />
                <p className="text-xs text-ink-3">
                  El usuario ingresa con ese nombre y contraseña, igual que en el CRM viejo.
                </p>
                <div className="flex justify-end pt-1">
                  <Button type="submit" disabled={crearUsuario.isPending}>
                    {crearUsuario.isPending ? 'Creando…' : 'Crear usuario'}
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
