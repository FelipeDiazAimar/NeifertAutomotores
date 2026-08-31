import { NavLink, useNavigate } from 'react-router-dom'
import { Car, Users, LogOut, KeyRound } from 'lucide-react'
import { supabase } from '@/services/supabaseClient'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import Logo from '@/components/common/Logo'
import ThemeToggle from '@/components/common/ThemeToggle'
import { cn } from '@/lib/cn'

const NAV = [
  { to: '/crm/clientes', label: 'Clientes', icon: Users },
  { to: '/crm/vehiculos', label: 'Vehículos', icon: Car },
]

export default function CrmSidebar({ onNavigate }) {
  const navigate = useNavigate()
  const { nombre, usuario, rol } = useCrmPerfil()

  async function salir() {
    await supabase.auth.signOut()
    navigate('/crm/login', { replace: true })
  }

  return (
    <div className="flex h-full flex-col gap-6 p-5">
      <NavLink to="/crm/vehiculos" onClick={onNavigate} className="px-2 pt-2" aria-label="CRM Neifert">
        <Logo />
      </NavLink>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors',
                isActive ? 'glass text-neifert' : 'text-ink-2 hover:text-ink',
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <NavLink
            to="/crm/cambiar-password"
            onClick={onNavigate}
            aria-label="Cambiar contraseña"
            className="grid h-10 w-10 place-items-center rounded-full text-ink-3 transition-colors hover:text-ink"
          >
            <KeyRound size={18} />
          </NavLink>
        </div>

        <div className="glass flex items-center justify-between gap-3 rounded-2xl p-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink">{nombre ?? usuario}</div>
            <div className="text-xs capitalize text-ink-3">{rol}</div>
          </div>
          <button
            onClick={salir}
            aria-label="Salir"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:text-neifert"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
