import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '@/services/supabaseClient'
import { emailDeUsuario } from '@/crm/lib/authEmail'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import '@/crm/styles/tokens.css'

export default function CrmLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const destino = location.state?.from?.pathname ?? '/crm/vehiculos'

  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (!usuario.trim() || !password) {
      setError('Completá usuario y contraseña.')
      return
    }
    if (!isSupabaseConfigured) {
      setError('El backend no está configurado.')
      return
    }
    setEnviando(true)
    const { error: err } = await supabase.auth.signInWithPassword({
      email: emailDeUsuario(usuario.trim()),
      password,
    })
    setEnviando(false)
    if (err) {
      setError('Usuario o contraseña incorrectos.')
      setPassword('')
      return
    }
    navigate(destino, { replace: true })
  }

  return (
    <div className="crm-root grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-2xl font-semibold tracking-tight">Neifert CRM</div>
          <div className="mt-1 text-sm text-[var(--crm-muted)]">Gestión automotor</div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-[var(--crm-line)] bg-[var(--crm-surface)] p-6">
          {error && (
            <p className="rounded-md bg-[var(--crm-falta)]/10 px-3 py-2 text-sm text-[var(--crm-falta)]">
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="usuario">Usuario</Label>
            <Input
              id="usuario"
              autoComplete="username"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-[var(--crm-muted)]">
          ¿Problemas para entrar? Contactá al administrador.{' '}
          <Link to="/" className="underline">Ver sitio</Link>
        </p>
      </div>
    </div>
  )
}
