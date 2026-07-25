import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  UserPlus,
  Users,
  TrendingUp,
  ClipboardList,
  Search,
  DatabaseZap,
} from 'lucide-react'
import Button from '@/components/common/Button'
import KpiCard from '@/components/crm/KpiCard'
import LeadForm from '@/components/crm/LeadForm'
import QuickFilters from '@/components/crm/QuickFilters'
import LeadTable from '@/components/crm/LeadTable'
import LeadCard from '@/components/crm/LeadCard'
import Spinner from '@/components/common/Spinner'
import Pagination from '@/components/common/Pagination'
import Select from '@/components/common/Select'
import SortDropdown from '@/components/catalog/SortDropdown'
import { useLeads, useLeadCounts } from '@/hooks/useLeads'
import { useRealtimeLeads } from '@/hooks/useRealtimeLeads'
import { useCrmStore } from '@/store/useCrmStore'
import { syncExternalCrm } from '@/services/crmIntegration.service'
import { LEAD_SORT_OPTIONS, LEAD_SOURCES } from '@/lib/constants'
import { cn } from '@/lib/cn'

const PAGE_SIZE = 10

// Mismas etiquetas que "Origen del lead" en LeadForm y la columna "Origen"
// de la tabla — un solo lugar (LEAD_SOURCES) para no desalinear nombres.
const ORIGIN_OPTIONS = [{ id: 'todos', label: 'Todos los orígenes' }, ...LEAD_SOURCES.map((s) => ({ id: s, label: s }))]

export default function CrmPage() {
  useRealtimeLeads()
  const { data: leads = [], isLoading } = useLeads()
  const { data: counts } = useLeadCounts()
  const mobileTab = useCrmStore((s) => s.mobileTab)
  const setMobileTab = useCrmStore((s) => s.setMobileTab)
  const search = useCrmStore((s) => s.search)
  const setSearch = useCrmStore((s) => s.setSearch)
  const sort = useCrmStore((s) => s.sort)
  const setSort = useCrmStore((s) => s.setSort)
  const originFilter = useCrmStore((s) => s.originFilter)
  const setOriginFilter = useCrmStore((s) => s.setOriginFilter)
  const quickFilter = useCrmStore((s) => s.quickFilter)
  const qc = useQueryClient()
  const [syncing, setSyncing] = useState(false)
  const autoSyncedRef = useRef(false)

  // Reset a la página 1 cuando cambia búsqueda/orden/filtro. Ajuste durante
  // el render (patrón recomendado por React) en vez de un useEffect, que
  // dispararía un render en cascada.
  const [page, setPage] = useState(1)
  const pageKey = JSON.stringify({ search, sort, quickFilter, originFilter })
  const [prevPageKey, setPrevPageKey] = useState(pageKey)
  if (pageKey !== prevPageKey) {
    setPrevPageKey(pageKey)
    setPage(1)
  }
  const totalPages = Math.max(1, Math.ceil(leads.length / PAGE_SIZE))
  const pageLeads = leads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const runSync = async ({ silent = false } = {}) => {
    setSyncing(true)
    try {
      const r = await syncExternalCrm()
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead-counts'] })
      if (!silent || r.count > 0) toast.success(`CRM sincronizado: ${r.count} cliente(s)`)
    } catch (e) {
      if (!silent) toast.error('No se pudo sincronizar con el CRM viejo: ' + e.message)
      else console.warn('[crm-sync] auto-sync falló (silencioso):', e.message)
    } finally {
      setSyncing(false)
    }
  }

  // Auto-sync best-effort al entrar al panel (una vez por sesión de la página)
  useEffect(() => {
    if (autoSyncedRef.current) return
    autoSyncedRef.current = true
    runSync({ silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const today = new Date().toDateString()
  const leadsHoy = leads.filter((l) => new Date(l.created_at).toDateString() === today).length
  const activos = counts?.seguimiento ?? 0
  const conversion = counts?.todos
    ? ((counts.finalizados / counts.todos) * 100).toFixed(1)
    : '0'
  const totalLeads = counts?.todos ?? 0

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-full bg-neifert px-4 py-1.5 text-sm font-semibold text-white shadow-glow-red">
          Gestión de Salón
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-xs font-medium text-ink-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
            Abierto ahora
          </span>
          <Button
            variant="glass"
            size="sm"
            icon={DatabaseZap}
            onClick={() => runSync()}
            disabled={syncing}
            className="text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">{syncing ? 'Sincronizando…' : 'Sincronizar con CRM'}</span>
            <span className="sm:hidden">{syncing ? 'Sync…' : 'Sync CRM'}</span>
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard icon={UserPlus} accent="red" label="Leads Hoy" value={leadsHoy} />
        <KpiCard icon={Users} accent="blue" label="Activos" value={activos} />
        <KpiCard icon={TrendingUp} accent="green" label="Conversión" value={`${conversion}%`} />
        <KpiCard icon={ClipboardList} accent="amber" label="Total Leads" value={totalLeads} />
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-ink">
              Listado de Leads Recientes
            </h2>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="glass field-glass flex h-10 flex-1 items-center gap-2 rounded-xl px-3 sm:max-w-xs">
              <Search size={16} className="shrink-0 text-ink-3" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o vehículo…"
                className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-36 sm:w-40">
                <Select
                  size="sm"
                  value={originFilter}
                  onChange={setOriginFilter}
                  options={ORIGIN_OPTIONS}
                />
              </div>
              <SortDropdown sort={sort} setSort={setSort} options={LEAD_SORT_OPTIONS} label="Orden:" />
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
                <LeadTable leads={pageLeads} />
              </div>
              <div className="space-y-3 md:hidden">
                {pageLeads.map((l) => (
                  <LeadCard key={l.id} lead={l} />
                ))}
              </div>
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
