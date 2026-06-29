import { NavLink, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Home, LayoutGrid, Camera, ShieldCheck } from 'lucide-react'
import { WhatsAppIcon } from '@/components/common/SocialIcons'
import ThemeToggle from '@/components/common/ThemeToggle'
import Logo from '@/components/common/Logo'
import { useUiStore } from '@/store/useUiStore'
import { cn } from '@/lib/cn'

const LINKS = [
  { to: '/', label: 'Historias', icon: Home, end: true },
  { to: '/catalogo', label: 'Catálogo', icon: LayoutGrid },
  { to: '/instagram', label: 'Instagram', icon: Camera },
  { to: '/cita', label: 'WhatsApp', icon: WhatsAppIcon },
]

export default function MobileSidebar() {
  const open = useUiStore((s) => s.mobileNavOpen)
  const setOpen = useUiStore((s) => s.setMobileNav)

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
              {LINKS.map(({ to, label, icon: Icon, end }) => (
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

            <div className="px-3 pb-2">
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-ink-3 transition-colors hover:bg-line hover:text-ink"
              >
                <ShieldCheck size={19} />
                Acceso admin
              </Link>
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
