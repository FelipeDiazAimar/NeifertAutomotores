import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/services/supabaseClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
      <h1 className="text-xl font-semibold tracking-tight">Cambiar contraseña</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {error && (
          <p className="rounded-md bg-[var(--crm-falta)]/10 px-3 py-2 text-sm text-[var(--crm-falta)]">
            {error}
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="nueva">Contraseña nueva</Label>
          <Input id="nueva" type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="repetir">Repetir contraseña</Label>
          <Input id="repetir" type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
        </div>
        <Button type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </Button>
      </form>
    </div>
  )
}
