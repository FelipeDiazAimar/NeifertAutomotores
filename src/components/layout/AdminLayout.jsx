import { Link } from 'react-router-dom'
import AdminSidebar from './AdminSidebar'
import AdminMobileSidebar from './AdminMobileSidebar'
import AnimatedOutlet from './AnimatedOutlet'
import Logo from '@/components/common/Logo'
import { Menu } from 'lucide-react'
import { useUiStore } from '@/store/useUiStore'

export default function AdminLayout() {
  const setMobileNav = useUiStore((s) => s.setMobileNav)

  return (
    <div className="mx-auto flex min-h-screen max-w-[1440px] gap-2">
      <AdminSidebar />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 px-4 pt-3 md:hidden">
          <div className="glass-nav flex h-14 items-center justify-between rounded-2xl px-4 shadow-glass">
            <Link to="/" aria-label="Inicio">
              <Logo />
            </Link>
            <button
              onClick={() => setMobileNav(true)}
              aria-label="Abrir menú"
              className="grid h-10 w-10 place-items-center rounded-full text-ink transition-colors hover:text-neifert"
            >
              <Menu size={22} />
            </button>
          </div>
        </header>
        <main className="px-4 pb-8 pt-4 md:px-6 md:pb-8 md:pt-6">
          <AnimatedOutlet />
        </main>
      </div>
      <AdminMobileSidebar />
    </div>
  )
}
