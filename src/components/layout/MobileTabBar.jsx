import { NavLink } from 'react-router-dom'
import { Home, LayoutGrid } from 'lucide-react'
import { InstagramIcon, WhatsAppIcon } from '@/components/common/SocialIcons'
import { cn } from '@/lib/cn'

const ITEMS = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/catalogo', label: 'Catálogo', icon: LayoutGrid },
  { to: '/instagram', label: 'Instagram', icon: InstagramIcon },
  { to: '/cita', label: 'WhatsApp', icon: WhatsAppIcon },
]

export default function MobileTabBar() {
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
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
