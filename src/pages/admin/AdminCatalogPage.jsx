import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Link2, X, Search, Eye, MessageCircle, RefreshCw } from 'lucide-react'
import { WhatsAppIcon } from '@/components/common/SocialIcons'
import { aggregateStats } from '@/lib/vehicleClicks'
import Button from '@/components/common/Button'
import GlassCard from '@/components/common/GlassCard'
import Spinner from '@/components/common/Spinner'
import VehicleForm from '@/components/admin/VehicleForm'
import SortDropdown from '@/components/catalog/SortDropdown'
import FilterPanel from '@/components/catalog/FilterPanel'
import { useAllVehicles, useVehicleMutations } from '@/hooks/useVehicles'
import { formatUSD, formatKm } from '@/lib/formatters'
import { vehicleMessage } from '@/lib/whatsapp'
import {
  EMPTY_FILTERS,
  countActiveFilters,
  filterAndSortVehicles,
} from '@/lib/filterVehicles'
import { cn } from '@/lib/cn'

const STATUS_STYLE = {
  disponible: 'border-success text-success',
  reservado: 'border-amber-500 text-amber-500',
  vendido: 'border-ink-3 text-ink-3',
}

function WideModal({ open, onClose, title, children }) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-start justify-center overflow-y-auto p-4 py-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="glass relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col rounded-[20px] shadow-glass"
            initial={{ scale: 0.96, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 10 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          >
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

export default function AdminCatalogPage() {
  const { data: vehicles = [], isLoading } = useAllVehicles()
  const { create, update, remove } = useVehicleMutations()
  const [editing, setEditing] = useState(null) // vehicle | 'new' | null

  // Toolbar local (búsqueda / orden / filtros), independiente del catálogo público.
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('price-desc')
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS })
  const [statsKey, setStatsKey] = useState(0)
  const stats = useMemo(() => aggregateStats(), [statsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleInFilter = (key, value) =>
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value],
    }))
  const patchFilters = (partial) => setFilters((f) => ({ ...f, ...partial }))
  const clearFilters = () => setFilters({ ...EMPTY_FILTERS })

  const shown = useMemo(
    () => filterAndSortVehicles(vehicles, { search, sort, filters }),
    [vehicles, search, sort, filters]
  )

  const saving = create.isPending || update.isPending

  const onSave = async (payload) => {
    try {
      if (editing === 'new') {
        await create.mutateAsync(payload)
        toast.success('Vehículo creado')
      } else {
        await update.mutateAsync({ id: editing.id, patch: payload })
        toast.success('Vehículo actualizado')
      }
      setEditing(null)
    } catch (e) {
      toast.error('No se pudo guardar: ' + e.message)
    }
  }

  const onDelete = async (v) => {
    if (!confirm(`¿Borrar ${v.brand} ${v.model}?`)) return
    await remove.mutateAsync(v.id)
    toast.success('Vehículo eliminado')
  }

  const copyLink = async (v) => {
    const url = `${window.location.origin}/catalogo/${v.id}`
    await navigator.clipboard.writeText(url)
    toast.success('Enlace copiado')
  }

  const copyWa = async (v) => {
    await navigator.clipboard.writeText(vehicleMessage(v, { origin: window.location.origin }))
    toast.success('Mensaje de WhatsApp copiado')
  }

  return (
    <section>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-neifert">Gestión</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold text-ink">Catálogo</h1>
          <p className="mt-1 text-sm text-ink-3">
            {shown.length} de {vehicles.length} vehículos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatsKey((k) => k + 1)}
            title="Actualizar estadísticas"
            className="grid h-9 w-9 place-items-center rounded-xl glass text-ink-2 transition-colors hover:text-neifert"
          >
            <RefreshCw size={15} />
          </button>
          <Button icon={Plus} onClick={() => setEditing('new')}>
            Nuevo vehículo
          </Button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="glass flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 sm:max-w-xs">
          <Search size={16} className="shrink-0 text-ink-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar marca, modelo o año…"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <FilterPanel
          filters={filters}
          toggleInFilter={toggleInFilter}
          setFilters={patchFilters}
          clearFilters={clearFilters}
          count={countActiveFilters(filters)}
        />
        <SortDropdown sort={sort} setSort={setSort} />
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-24">
          <Spinner size={32} />
        </div>
      ) : shown.length === 0 ? (
        <div className="glass grid place-items-center rounded-[20px] py-20 text-center">
          <p className="text-ink-2">No hay vehículos con esos criterios.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((v) => (
            <GlassCard key={v.id} className="overflow-hidden">
              <div className="flex gap-3 p-3">
                <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-surface">
                  {v.main_image_url || v.images?.[0] ? (
                    <img
                      src={v.main_image_url || v.images[0]}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-[10px] text-ink-3">
                      sin foto
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neifert">
                    {v.brand}
                  </p>
                  <p className="truncate font-display font-bold text-ink">{v.model}</p>
                  <p className="text-sm font-extrabold text-ink">{formatUSD(v.price_usd)}</p>
                  <p className="text-xs text-ink-3">
                    {v.year} · {formatKm(v.km)}
                  </p>
                </div>
                <span
                  className={cn(
                    'h-fit shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize',
                    STATUS_STYLE[v.status] || STATUS_STYLE.disponible
                  )}
                >
                  {v.status || 'disponible'}
                </span>
              </div>
              {/* Stats por vehículo */}
              {(() => {
                const s = stats[v.id] || { views: 0, conversions: 0, rate: 0 }
                return (
                  <div className="flex items-center gap-3 border-t border-line px-3 py-2 text-xs text-ink-3">
                    <span className="flex items-center gap-1">
                      <Eye size={12} /> {s.views} vistas
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle size={12} /> {s.conversions} consultas
                    </span>
                    <span className={cn('ml-auto font-semibold', s.rate >= 15 ? 'text-success' : s.rate >= 5 ? 'text-amber-500' : 'text-ink-3')}>
                      {s.rate.toFixed(1)}%
                    </span>
                  </div>
                )
              })()}
              <div className="flex items-center gap-1 border-t border-line px-2 py-1.5">
                <IconBtn icon={Pencil} label="Editar" onClick={() => setEditing(v)} />
                <IconBtn icon={Link2} label="Copiar enlace" onClick={() => copyLink(v)} />
                <IconBtn icon={WhatsAppIcon} label="Copiar WhatsApp" onClick={() => copyWa(v)} />
                <div className="flex-1" />
                <IconBtn icon={Trash2} label="Borrar" danger onClick={() => onDelete(v)} />
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      <WideModal
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nuevo vehículo' : `Editar ${editing?.brand || ''} ${editing?.model || ''}`}
      >
        {editing != null && (
          <VehicleForm
            initial={editing === 'new' ? null : editing}
            onSave={onSave}
            onCancel={() => setEditing(null)}
            saving={saving}
          />
        )}
      </WideModal>
    </section>
  )
}

function IconBtn({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'grid h-9 w-9 place-items-center rounded-lg transition-colors hover:bg-surface',
        danger ? 'text-ink-3 hover:text-neifert' : 'text-ink-2 hover:text-ink'
      )}
    >
      <Icon size={16} />
    </button>
  )
}
