import { useState } from 'react'
import { Navigate, useLocation, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { User, Lock, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import Logo from '@/components/common/Logo'
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import ThemeToggle from '@/components/common/ThemeToggle'
import { useAuth } from '@/hooks/useAuth'

export default function LoginPage() {
  const { signIn, isAuthenticated, isDemo, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/admin/catalogo'

  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && isAuthenticated) return <Navigate to={from} replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    const { error } = await signIn(user, password)
    setSubmitting(false)
    if (error) {
      toast.error(error.message || 'No pudimos iniciar sesión. Revisá tus datos.')
    } else {
      toast.success('Bienvenido a Neifert')
      navigate(from, { replace: true })
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center px-4">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass w-full max-w-md rounded-[24px] p-8 shadow-glass"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-10" />
          <h1 className="mt-6 text-2xl font-bold text-ink">Panel de Gestión</h1>
          <p className="mt-1 text-sm text-ink-2">Ingresá para administrar el salón</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Usuario"
            type="text"
            icon={User}
            placeholder="Tu usuario del CRM"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            required
          />
          <Input
            label="Contraseña"
            type="password"
            icon={Lock}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button
            type="submit"
            size="lg"
            className="w-full"
            iconRight={ArrowRight}
            disabled={submitting}
          >
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </form>

        {isDemo && (
          <p className="mt-5 rounded-2xl bg-neifert/10 p-3 text-center text-xs text-ink-2">
            Se valida contra el CRM viejo (mismo usuario y contraseña de siempre).
            Los datos del catálogo siguen en modo demo hasta conectar Supabase.
          </p>
        )}

        <Link
          to="/"
          className="mt-6 block text-center text-sm text-ink-3 transition-colors hover:text-neifert"
        >
          ← Volver al inicio
        </Link>
      </motion.div>
    </div>
  )
}
