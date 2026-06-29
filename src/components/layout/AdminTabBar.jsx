import { NavLink } from 'react-router-dom'
import { Users, Car, LayoutTemplate, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/cn'

const ITEMS = [
  { to: '/admin/crm', label: 'CRM', icon: Users },
  { to: '/admin/catalogo', label: 'Catálogo', icon: Car },
  { to: '/admin/contenido', label: 'Contenido', icon: LayoutTemplate },
  { to: '/admin/estadisticas', label: 'Métricas', icon: BarChart3 },
]

export default function AdminTabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 md:hidden">
      <div className="glass-nav mx-auto flex max-w-md items-center justify-around rounded-3xl p-2 shadow-glass">
        {ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-medium transition-colors',
                isActive ? 'text-neifert' : 'text-ink-3'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
