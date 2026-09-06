import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '@/services/supabaseClient'
import { emailDeUsuario } from '@/crm/lib/authEmail'
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import GlassCard from '@/components/common/GlassCard'
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
          <div className="font-display text-2xl font-bold text-ink">
            Neifert<span className="text-neifert">.</span>CRM
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-wider text-ink-3">
            Sistema de gestión automotor
          </div>
        </div>

        <GlassCard as="form" onSubmit={onSubmit} className="space-y-4 p-6">
          <h1 className="font-display text-lg font-bold text-ink">Iniciar sesión</h1>

          {error && (
            <p className="rounded-2xl border border-neifert/40 bg-neifert/10 px-3 py-2 text-sm text-neifert">
              {error}
            </p>
          )}

          <Input
            label="Usuario"
            autoComplete="username"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoFocus
          />
          <Input
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </GlassCard>

        <p className="mt-4 text-center text-xs text-ink-3">
          ¿Problemas para entrar? Contactá al administrador.{' '}
          <Link to="/" className="underline">Ver sitio</Link>
        </p>
      </div>
    </div>
  )
}
