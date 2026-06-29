import { Link, NavLink } from 'react-router-dom'
import { Search, Menu } from 'lucide-react'
import Logo from '@/components/common/Logo'
import ThemeToggle from '@/components/common/ThemeToggle'
import { useUiStore } from '@/store/useUiStore'
import { cn } from '@/lib/cn'

const LINKS = [
  { to: '/', label: 'Historias', end: true },
  { to: '/catalogo', label: 'Catálogo' },
  { to: '/instagram', label: 'Instagram' },
  { to: '/cita', label: 'WhatsApp' },
]

export default function PublicNavbar() {
  const openAiSearch = useUiStore((s) => s.setAiSearch)
  const setMobileNav = useUiStore((s) => s.setMobileNav)

  return (
    <header className="sticky top-0 z-30 px-4 pt-3 md:px-8">
      <nav className="glass-nav mx-auto flex h-16 max-w-7xl items-center justify-between rounded-2xl px-4 shadow-glass md:px-6">
        <Link to="/" aria-label="Inicio" className="flex items-center">
          <Logo />
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.to}>
              <NavLink
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                    isActive ? 'text-neifert' : 'text-ink-2 hover:text-ink'
                  )
                }
              >
                {l.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <button
            onClick={() => openAiSearch(true)}
            aria-label="Buscar"
            className="grid h-10 w-10 place-items-center rounded-full text-ink transition-colors hover:text-neifert"
          >
            <Search size={18} />
          </button>
          {/* Toggle de tema — solo en desktop */}
          <div className="hidden md:block">
            <ThemeToggle />
          </div>
          {/* Hamburguesa — solo en mobile */}
          <button
            onClick={() => setMobileNav(true)}
            aria-label="Abrir menú"
            className="grid h-10 w-10 place-items-center rounded-full text-ink transition-colors hover:text-neifert md:hidden"
          >
            <Menu size={22} />
          </button>
        </div>
      </nav>
    </header>
  )
}
