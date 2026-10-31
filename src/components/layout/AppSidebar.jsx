import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  Home,
  Car,
  BarChart3,
  Bell,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  UserCog,
  Users,
  ListTodo,
  ClipboardCheck,
  FileStack,
  FileText,
  KeyRound,
  MessageCircle,
} from 'lucide-react'
import { supabase } from '@/services/supabaseClient'
import Logo from '@/components/common/Logo'
import ThemeToggle from '@/components/common/ThemeToggle'
import ActivarNotificaciones from '@/crm/components/ActivarNotificaciones'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import { useMisVistas } from '@/crm/hooks/useMisVistas'
import { useTareasPendientesHoy } from '@/crm/hooks/useTareas'
import { cn } from '@/lib/cn'

const NAV = [
  { to: '/crm', label: 'Panel', icon: LayoutDashboard, vista: 'panel', end: true },
  { to: '/admin/crm', label: 'Carga Leads', icon: Users, vista: 'leads' },
  { to: '/crm/vehiculos', label: 'Catálogo', icon: Car, vista: 'vehiculos' },
  {
    to: '/crm/presupuestos',
    label: 'Presupuestos',
    icon: FileText,
    vista: 'presupuestos',
  },
  { to: '/crm/clientes', label: 'Clientes', icon: Users, vista: 'clientes' },
  {
    to: '/crm/tareas',
    label: 'Tareas',
    icon: ListTodo,
    badge: 'tareas',
    vista: 'tareas',
  },
  { to: '/crm/alertas', label: 'Alertas', icon: Bell, vista: 'alertas' },
  { to: '/crm/peritaje', label: 'Peritaje', icon: ClipboardCheck, vista: 'peritaje' },
  { to: '/crm/gestoria', label: 'Gestoría', icon: FileStack, vista: 'gestoria' },
  // Sin vista: todo usuario del CRM entra al WhatsApp con su propio usuario.
  { to: '/crm/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  {
    to: '/admin/estadisticas',
    label: 'Estadísticas',
    icon: BarChart3,
    vista: 'estadisticas',
  },
  {
    to: '/admin/contenido',
    label: 'Administración Contenido Web',
    icon: LayoutTemplate,
    vista: 'contenido',
  },
  { to: '/admin/admin', label: 'Admin', icon: UserCog, vista: 'admin' },
  { to: '/', label: 'Ver sitio', icon: Home, end: true },
]

export default function AppSidebar() {
  const navigate = useNavigate()
  const { nombre, usuario, rol } = useCrmPerfil()
  const { vistas, cargando } = useMisVistas()
  const { data: tareasHoy = 0 } = useTareasPendientesHoy()
  const items = cargando ? NAV : NAV.filter((n) => !n.vista || vistas.includes(n.vista))

  async function salir() {
    await supabase.auth.signOut()
    navigate('/crm/login', { replace: true })
  }

  return (
    <aside className="sticky top-0 hidden h-screen max-h-screen w-60 shrink-0 flex-col gap-3 self-start py-5 pr-3 pl-2 md:flex">
      <Link to="/" className="shrink-0 px-2 pt-2" aria-label="Inicio">
        <Logo />
      </Link>

      {/* data-lenis-prevent: la app usa Lenis root (smooth scroll) y sin esto
          la rueda nunca llega a este scroll interno, scrollea la página. */}
      <div
        data-lenis-prevent
        className="crm-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        <nav className="flex min-h-min flex-col gap-1 pr-1.5 pb-1">
          {items.map(({ to, label, icon: Icon, badge, end }) => (
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
              <span className="flex-1">{label}</span>
              {badge === 'tareas' && tareasHoy > 0 && (
                <span className="bg-neifert grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold text-white">
                  {tareasHoy}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex shrink-0 flex-col gap-3">
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ActivarNotificaciones />
          <NavLink
            to="/crm/cambiar-password"
            aria-label="Cambiar contraseña"
            className="text-ink-3 hover:text-ink grid h-10 w-10 place-items-center rounded-full transition-colors"
          >
            <KeyRound size={18} />
          </NavLink>
        </div>
        <div className="glass flex items-center gap-3 rounded-2xl p-3">
          <span className="bg-neifert/15 text-neifert grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold">
            {(nombre || usuario || 'NA').slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-ink truncate text-sm font-semibold">
              {nombre ?? usuario ?? 'Usuario'}
            </p>
            <p className="text-ink-3 truncate text-xs capitalize">{rol}</p>
          </div>
          <button
            onClick={salir}
            aria-label="Cerrar sesión"
            className="text-ink-3 hover:text-neifert transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  )
}

export { NAV }
