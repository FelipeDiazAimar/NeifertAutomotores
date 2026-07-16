import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Car, LayoutTemplate, BarChart3, Home, UserCog, LogOut, HardDrive } from 'lucide-react'
import Logo from '@/components/common/Logo'
import ThemeToggle from '@/components/common/ThemeToggle'
import { useUiStore } from '@/store/useUiStore'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/cn'

const NAV = [
  { to: '/admin/catalogo', label: 'Catálogo', icon: Car },
  { to: '/admin/contenido', label: 'Contenido', icon: LayoutTemplate },
  { to: '/admin/estadisticas', label: 'Estadísticas', icon: BarChart3 },
  { to: '/admin/usuarios', label: 'Usuarios', icon: UserCog },
  { to: '/admin/almacenamiento', label: 'Almacenamiento', icon: HardDrive },
  { to: '/', label: 'Ver sitio', icon: Home, end: true },
]

export default function AdminMobileSidebar() {
  const open = useUiStore((s) => s.mobileNavOpen)
  const setOpen = useUiStore((s) => s.setMobileNav)
  const { profile, signOut } = useAuth()

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          />

          <motion.aside
            key="sidebar"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed inset-y-0 right-0 z-50 flex w-72 flex-col bg-surface-solid shadow-2xl md:hidden"
          >
            <div className="flex items-center justify-between px-5 py-5">
              <Logo />
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="grid h-9 w-9 place-items-center rounded-full bg-line text-ink transition-colors hover:text-neifert"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-1">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-neifert/10 text-neifert'
                        : 'text-ink-2 hover:bg-line hover:text-ink'
                    )
                  }
                >
                  <Icon size={19} />
                  {label}
                </NavLink>
              ))}
            </nav>

            {/* Usuario */}
            <div className="px-4 pb-2">
              <div className="glass flex items-center gap-3 rounded-2xl p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neifert/15 text-sm font-bold text-neifert">
                  {(profile?.full_name || 'NA').slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {profile?.full_name || 'Usuario'}
                  </p>
                  <p className="truncate text-xs text-ink-3">{profile?.role || 'Admin'}</p>
                </div>
                <button
                  onClick={() => { signOut(); setOpen(false) }}
                  aria-label="Cerrar sesión"
                  className="text-ink-3 transition-colors hover:text-neifert"
                >
                  <LogOut size={18} />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-line px-5 py-5">
              <span className="text-xs font-medium text-ink-3">Apariencia</span>
              <ThemeToggle />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
