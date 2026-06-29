import {
  UserPlus,
  Users,
  TrendingUp,
  CalendarCheck,
  ClipboardList,
  Search,
} from 'lucide-react'
import KpiCard from '@/components/crm/KpiCard'
import LeadForm from '@/components/crm/LeadForm'
import QuickFilters from '@/components/crm/QuickFilters'
import LeadTable from '@/components/crm/LeadTable'
import LeadCard from '@/components/crm/LeadCard'
import Spinner from '@/components/common/Spinner'
import { useLeads, useLeadCounts } from '@/hooks/useLeads'
import { useRealtimeLeads } from '@/hooks/useRealtimeLeads'
import { useCrmStore } from '@/store/useCrmStore'
import { cn } from '@/lib/cn'

export default function CrmPage() {
  useRealtimeLeads()
  const { data: leads = [], isLoading } = useLeads()
  const { data: counts } = useLeadCounts()
  const mobileTab = useCrmStore((s) => s.mobileTab)
  const setMobileTab = useCrmStore((s) => s.setMobileTab)
  const search = useCrmStore((s) => s.search)
  const setSearch = useCrmStore((s) => s.setSearch)

  const today = new Date().toDateString()
  const leadsHoy = leads.filter((l) => new Date(l.created_at).toDateString() === today).length
  const activos = counts?.seguimiento ?? 0
  const conversion = counts?.todos
    ? ((counts.finalizados / counts.todos) * 100).toFixed(1)
    : '0'

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <span className="rounded-full bg-neifert px-4 py-1.5 text-sm font-semibold text-white shadow-glow-red">
          Gestión de Salón
        </span>
        <span className="flex items-center gap-2 text-xs font-medium text-ink-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
          Abierto ahora
        </span>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard icon={UserPlus} accent="red" label="Leads Hoy" value={leadsHoy} />
        <KpiCard icon={Users} accent="blue" label="Activos" value={activos} />
        <KpiCard icon={TrendingUp} accent="green" label="Conversión" value={`${conversion}%`} />
        <KpiCard icon={CalendarCheck} accent="amber" label="Test Drives" value={8} />
      </div>

      <div className="glass grid grid-cols-2 gap-1 rounded-2xl p-1 md:hidden">
        {[
          ['registrar', 'Registrar', UserPlus],
          ['leads', 'Leads', ClipboardList],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setMobileTab(id)}
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors',
              mobileTab === id ? 'bg-neifert text-white' : 'text-ink-2'
            )}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        <div className={cn(mobileTab !== 'registrar' && 'hidden md:block')}>
          <LeadForm />
        </div>

        <div className={cn('space-y-4', mobileTab !== 'leads' && 'hidden md:block')}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-ink">
              Listado de Leads Recientes
            </h2>
            <div className="glass hidden h-10 items-center gap-2 rounded-xl px-3 md:flex">
              <Search size={16} className="text-ink-3" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar lead…"
                className="w-40 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
              />
            </div>
          </div>

          <QuickFilters />

          {isLoading ? (
            <div className="grid place-items-center py-16">
              <Spinner />
            </div>
          ) : leads.length === 0 ? (
            <div className="glass grid place-items-center rounded-[20px] py-16 text-center text-ink-2">
              No hay leads para este filtro.
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <LeadTable leads={leads} />
              </div>
              <div className="space-y-3 md:hidden">
                {leads.map((l) => (
                  <LeadCard key={l.id} lead={l} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
