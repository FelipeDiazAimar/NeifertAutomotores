import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { TooltipProvider } from '@/components/ui/tooltip'
import CrmSidebar from './CrmSidebar'
import '@/crm/styles/tokens.css'

export default function CrmLayout() {
  const [open, setOpen] = useState(false)

  return (
    <TooltipProvider>
      <div className="crm-root flex min-h-screen">
        {/* Sidebar fija — escritorio */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-[var(--crm-line)] bg-[var(--crm-surface)] md:block">
          <CrmSidebar />
        </aside>

        <div className="min-w-0 flex-1">
          {/* Topbar — móvil */}
          <header className="flex h-14 items-center gap-3 border-b border-[var(--crm-line)] px-4 md:hidden">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                aria-label="Abrir menú"
                className="rounded-lg p-2 text-[var(--crm-ink)]"
              >
                <Menu size={20} />
              </SheetTrigger>
              <SheetContent side="left" className="w-64 bg-[var(--crm-surface)] p-0">
                <SheetTitle className="sr-only">Menú</SheetTitle>
                <CrmSidebar onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="text-sm font-semibold tracking-tight">Neifert CRM</span>
          </header>

          <main className="px-4 py-6 md:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
