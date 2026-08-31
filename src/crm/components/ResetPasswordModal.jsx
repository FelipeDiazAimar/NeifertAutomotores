import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLenis } from 'lenis/react'
import { X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import { resetPasswordSchema } from '@/crm/lib/usuarioSchema'
import { useUsuarioMutations } from '@/crm/hooks/useUsuarios'

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

export default function ResetPasswordModal({ open, onClose, usuario }) {
  useLockScroll(open, onClose)
  const { resetPassword } = useUsuarioMutations()

  const {
    register, handleSubmit, reset, formState: { errors },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', repetir: '' },
  })

  useEffect(() => {
    if (open) reset({ password: '', repetir: '' })
  }, [open, reset])

  function submit(data) {
    resetPassword.mutate({ id: usuario.id, password: data.password }, { onSuccess: onClose })
  }

  return createPortal(
    <AnimatePresence>
      {open && usuario && (
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
              aria-label={`Resetear contraseña de ${usuario.nombre}`}
              className="glass relative z-10 my-4 w-full max-w-sm rounded-[20px] p-6 shadow-glass"
              initial={{ scale: 0.96, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, y: 8 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-ink">Resetear contraseña</h2>
                <button onClick={onClose} aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-full text-ink-3 hover:bg-surface hover:text-ink">
                  <X size={18} />
                </button>
              </div>

              <p className="mb-3 text-sm text-ink-2">
                Nueva contraseña para <span className="font-semibold text-ink">{usuario.nombre}</span> (@{usuario.usuario}).
              </p>

              <form onSubmit={handleSubmit(submit)} className="space-y-3">
                <Input label="Contraseña nueva" type="text" {...register('password')} error={errors.password?.message} />
                <Input label="Repetir" type="text" {...register('repetir')} error={errors.repetir?.message} />
                <div className="flex justify-end pt-1">
                  <Button type="submit" disabled={resetPassword.isPending}>
                    {resetPassword.isPending ? 'Guardando…' : 'Cambiar contraseña'}
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
