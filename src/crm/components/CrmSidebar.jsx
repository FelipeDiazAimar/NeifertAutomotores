import { NavLink, useNavigate } from 'react-router-dom'
import { Car, LogOut, KeyRound } from 'lucide-react'
import { supabase } from '@/services/supabaseClient'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import CrmThemeToggle from './CrmThemeToggle'
import { cn } from '@/lib/utils'

const NAV = [{ to: '/crm/vehiculos', label: 'Vehículos', icon: Car }]

export default function CrmSidebar({ onNavigate }) {
  const navigate = useNavigate()
  const { nombre, usuario, rol } = useCrmPerfil()

  async function salir() {
    await supabase.auth.signOut()
    navigate('/crm/login', { replace: true })
  }

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-1">
        <div className="text-base font-semibold tracking-tight">Neifert CRM</div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[var(--crm-accent)]/10 text-[var(--crm-accent)]'
                  : 'text-[var(--crm-muted)] hover:bg-black/[0.03] hover:text-[var(--crm-ink)] dark:hover:bg-white/[0.04]',
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-3">
        <div className="flex items-center justify-between">
          <CrmThemeToggle />
          <NavLink
            to="/crm/cambiar-password"
            onClick={onNavigate}
            aria-label="Cambiar contraseña"
            className="rounded-lg p-2 text-[var(--crm-muted)] hover:text-[var(--crm-ink)]"
          >
            <KeyRound size={18} />
          </NavLink>
        </div>

        <div className="rounded-lg border border-[var(--crm-line)] p-3">
          <div className="text-sm font-medium">{nombre ?? usuario}</div>
          <div className="text-xs text-[var(--crm-muted)] capitalize">{rol}</div>
          <button
            onClick={salir}
            className="mt-2 flex items-center gap-2 text-xs text-[var(--crm-muted)] hover:text-[var(--crm-falta)]"
          >
            <LogOut size={14} />
            Salir
          </button>
        </div>
      </div>
    </div>
  )
}
