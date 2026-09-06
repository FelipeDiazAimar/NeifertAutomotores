import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/services/supabaseClient'
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import GlassCard from '@/components/common/GlassCard'

export default function CambiarPasswordPage() {
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (nueva.length < 8) {
      setError('La contraseña nueva tiene que tener al menos 8 caracteres.')
      return
    }
    if (nueva !== repetir) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setEnviando(true)
    const { error: err } = await supabase.auth.updateUser({ password: nueva })
    setEnviando(false)
    if (err) {
      setError(err.message)
      return
    }
    setNueva('')
    setRepetir('')
    toast.success('Contraseña actualizada.')
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="font-display text-xl font-bold text-ink">Cambiar contraseña</h1>
      <GlassCard as="form" onSubmit={onSubmit} className="mt-6 space-y-4 p-6">
        {error && (
          <p className="rounded-2xl border border-neifert/40 bg-neifert/10 px-3 py-2 text-sm text-neifert">
            {error}
          </p>
        )}
        <Input
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
        />
        <Input
          label="Repetir contraseña"
          type="password"
          autoComplete="new-password"
          value={repetir}
          onChange={(e) => setRepetir(e.target.value)}
        />
        <Button type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </Button>
      </GlassCard>
    </div>
  )
}
