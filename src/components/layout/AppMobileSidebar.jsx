import { Link, NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Car, LayoutTemplate, BarChart3, Home, UserCog, LogOut, Users, ListTodo,
  ClipboardCheck, FileStack,
} from 'lucide-react'
import { supabase } from '@/services/supabaseClient'
import Logo from '@/components/common/Logo'
import ThemeToggle from '@/components/common/ThemeToggle'
import { useUiStore } from '@/store/useUiStore'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import { useMisVistas } from '@/crm/hooks/useMisVistas'
import { useTareasPendientesHoy } from '@/crm/hooks/useTareas'
import { cn } from '@/lib/cn'

const NAV = [
  { to: '/admin/crm', label: 'Carga Leads', icon: Users, vista: 'leads' },
  { to: '/crm/vehiculos', label: 'Catálogo', icon: Car, vista: 'vehiculos' },
  { to: '/crm/clientes', label: 'Clientes', icon: Users, vista: 'clientes' },
  { to: '/crm/tareas', label: 'Tareas', icon: ListTodo, badge: 'tareas', vista: 'tareas' },
  { to: '/crm/peritaje', label: 'Peritaje', icon: ClipboardCheck, vista: 'peritaje' },
  { to: '/crm/gestoria', label: 'Gestoría', icon: FileStack, vista: 'gestoria' },
  { to: '/admin/estadisticas', label: 'Estadísticas', icon: BarChart3, vista: 'estadisticas' },
  { to: '/admin/contenido', label: 'Administración Contenido Web', icon: LayoutTemplate, vista: 'contenido' },
  { to: '/admin/admin', label: 'Admin', icon: UserCog, vista: 'admin' },
  { to: '/', label: 'Ver sitio', icon: Home, end: true },
]

export default function AppMobileSidebar() {
  const open = useUiStore((s) => s.mobileNavOpen)
  const setOpen = useUiStore((s) => s.setMobileNav)
  const navigate = useNavigate()
  const { nombre, usuario, rol } = useCrmPerfil()
  const { vistas, cargando } = useMisVistas()
  const { data: tareasHoy = 0 } = useTareasPendientesHoy()
  const items = cargando ? NAV : NAV.filter((n) => !n.vista || vistas.includes(n.vista))

  async function salir() {
    await supabase.auth.signOut()
    setOpen(false)
    navigate('/crm/login', { replace: true })
  }

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
            className="fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col bg-surface-solid shadow-2xl md:hidden"
          >
            <div className="flex items-center justify-between px-5 py-5">
              <Link to="/" onClick={() => setOpen(false)} aria-label="Inicio">
                <Logo />
              </Link>
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="grid h-9 w-9 place-items-center rounded-full bg-line text-ink transition-colors hover:text-neifert"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-1">
              {items.map(({ to, label, icon: Icon, badge, end }) => (
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
                  <span className="flex-1">{label}</span>
                  {badge === 'tareas' && tareasHoy > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-neifert px-1 text-[11px] font-bold text-white">
                      {tareasHoy}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="px-4 pb-2">
              <div className="glass flex items-center gap-3 rounded-2xl p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neifert/15 text-sm font-bold text-neifert">
                  {(nombre || usuario || 'NA').slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {nombre ?? usuario ?? 'Usuario'}
                  </p>
                  <p className="truncate text-xs capitalize text-ink-3">{rol}</p>
                </div>
                <button
                  onClick={salir}
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
