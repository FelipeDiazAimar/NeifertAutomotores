import { Link, NavLink } from 'react-router-dom'
import { Home, Car, BarChart3, LayoutTemplate, LogOut, UserCog, HardDrive, Bug } from 'lucide-react'
import Logo from '@/components/common/Logo'
import ThemeToggle from '@/components/common/ThemeToggle'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/cn'

const NAV = [
  { to: '/admin/catalogo', label: 'Catálogo', icon: Car },
  { to: '/admin/contenido', label: 'Contenido', icon: LayoutTemplate },
  { to: '/admin/estadisticas', label: 'Estadísticas', icon: BarChart3 },
  { to: '/admin/usuarios', label: 'Usuarios', icon: UserCog },
  { to: '/admin/almacenamiento', label: 'Almacenamiento', icon: HardDrive },
  { to: '/admin/logerrors', label: 'Logs y errores', icon: Bug },
  { to: '/', label: 'Ver sitio', icon: Home, end: true },
]

export default function AdminSidebar() {
  const { profile, signOut } = useAuth()
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 p-5 md:flex">
      <Link to="/" className="px-2 pt-2" aria-label="Inicio">
        <Logo />
      </Link>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors',
                isActive ? 'glass text-neifert' : 'text-ink-2 hover:text-ink'
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <ThemeToggle className="self-start" />
        <div className="glass flex items-center gap-3 rounded-2xl p-3">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-full bg-neifert/15 text-sm font-bold text-neifert">
              {(profile?.full_name || 'NA').slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">
              {profile?.full_name || 'Usuario'}
            </p>
            <p className="truncate text-xs text-ink-3">{profile?.role || 'Admin'}</p>
          </div>
          <button
            onClick={signOut}
            aria-label="Cerrar sesión"
            className="text-ink-3 transition-colors hover:text-neifert"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  )
}
