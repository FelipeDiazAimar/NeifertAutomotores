import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { useAvisoTareasHoy } from '@/crm/hooks/useAvisoTareasHoy'
import Logo from '@/components/common/Logo'
import CrmSidebar from './CrmSidebar'
import '@/crm/styles/tokens.css'

export default function CrmLayout() {
  const [open, setOpen] = useState(false)
  useAvisoTareasHoy()

  return (
    <div className="crm-root mx-auto flex min-h-screen max-w-[1440px] gap-2 overflow-x-hidden">
      {/* Sidebar fija — escritorio */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 md:block">
        <CrmSidebar />
      </aside>

      <div className="min-w-0 flex-1">
        {/* Topbar — móvil */}
        <header className="sticky top-0 z-30 px-4 pt-3 md:hidden">
          <div className="glass-nav flex h-14 items-center justify-between rounded-2xl px-4 shadow-glass">
            <Link to="/crm/vehiculos" aria-label="CRM Neifert">
              <Logo className="h-8" />
            </Link>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                aria-label="Abrir menú"
                className="grid h-10 w-10 place-items-center rounded-full text-ink transition-colors hover:text-neifert"
              >
                <Menu size={22} />
              </SheetTrigger>
              <SheetContent side="left" className="glass w-72 border-0 p-0">
                <SheetTitle className="sr-only">Menú</SheetTitle>
                <CrmSidebar onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <main className="px-4 pb-10 pt-4 md:px-6 md:pt-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
