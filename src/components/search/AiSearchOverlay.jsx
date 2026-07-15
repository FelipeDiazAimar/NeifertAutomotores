import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Sparkles, Search, X, LayoutGrid, List } from 'lucide-react'
import { useLenis } from 'lenis/react'
import VehicleCard from '@/components/catalog/VehicleCard'
import { fetchVehicles } from '@/services/vehicles.service'
import { searchVehicles } from '@/lib/vehicleSearch'
import { useUiStore } from '@/store/useUiStore'
import { useSiteStore } from '@/store/useSiteStore'
import { cn } from '@/lib/cn'

const SUGGESTIONS = ['SUV familiar', 'Eléctrico 0km', 'Deportivo premium', 'Audi 2024', 'Algo económico']

export default function AiSearchOverlay() {
  const open = useUiStore((s) => s.aiSearchOpen)
  const setOpen = useUiStore((s) => s.setAiSearch)
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [view, setView] = useState('grid')
  const location = useLocation()

  const runSearch = (q) => {
    const term = (q ?? query).trim()
    setQuery(term)
    setSubmitted(term)
  }

  const { data: pool = [] } = useQuery({
    queryKey: ['vehicles', 'ai-pool'],
    queryFn: () => fetchVehicles({ category: 'todos', sort: 'price-desc' }),
    enabled: open,
  })

  // Cerrar al navegar a otra ruta (p. ej. al abrir un vehículo)
  useEffect(() => {
    setOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  // Pausar Lenis mientras el overlay está abierto
  const lenis = useLenis()
  useEffect(() => {
    if (!lenis) return
    if (open) lenis.stop()
    else lenis.start()
    return () => lenis.start()
  }, [open, lenis])

  // Cerrar con Escape + bloquear scroll de fondo
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, setOpen])

  // Reiniciar al cerrar para que reabra limpio (reset en render, sin efecto)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) {
      setQuery('')
      setSubmitted('')
    }
  }

  const categories = useSiteStore((s) => s.categories)
  const results = useMemo(
    () => searchVehicles(submitted, pool, categories),
    [submitted, pool, categories]
  )
  const hasQuery = submitted.trim().length > 0

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop — fixed, detrás del contenido */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xl"
            onClick={() => setOpen(false)}
          />

          {/* Contenedor scrollable independiente del fondo */}
          <div data-lenis-prevent className="relative z-10 h-full overflow-y-auto overscroll-contain">
          <div className="mx-auto max-w-5xl px-4 py-10 md:py-16 pb-20">
            <motion.div
              initial={{ y: -16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 240, damping: 24 }}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-2 rounded-full bg-neifert/15 px-3 py-1 text-xs font-semibold text-neifert">
                  <Sparkles size={13} /> Búsqueda inteligente
                </span>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar"
                  className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-ink backdrop-blur transition-colors hover:text-neifert"
                >
                  <X size={18} />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  runSearch()
                }}
                className="glass flex items-center gap-3 rounded-2xl px-4 py-3 shadow-glass"
              >
                <Search size={22} className="shrink-0 text-neifert" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="¿Qué estás buscando? Ej: SUV híbrido 0km…"
                  className="w-full bg-transparent text-lg text-ink outline-none placeholder:text-ink-3"
                />
                <button
                  type="submit"
                  disabled={!query.trim()}
                  className="shrink-0 rounded-xl bg-neifert px-4 py-2 text-sm font-semibold text-white shadow-glow-red transition-opacity disabled:opacity-40"
                >
                  Buscar
                </button>
              </form>

              <div className="mt-4 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => runSearch(s)}
                    className="glass rounded-full px-3 py-1.5 text-sm text-ink-2 transition-colors hover:text-neifert"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </motion.div>

            {hasQuery && (
              <div className="mt-8">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm text-ink-2">
                    {results.length > 0
                      ? `${results.length} ${results.length === 1 ? 'recomendación' : 'recomendaciones'} para vos`
                      : 'Sin coincidencias'}
                  </p>
                  <div className="glass flex items-center gap-1 rounded-xl p-1">
                    {[
                      ['grid', LayoutGrid],
                      ['list', List],
                    ].map(([mode, Icon]) => (
                      <button
                        key={mode}
                        onClick={() => setView(mode)}
                        aria-label={`Vista ${mode}`}
                        className={cn(
                          'grid h-8 w-8 place-items-center rounded-lg transition-colors',
                          view === mode ? 'bg-neifert text-white' : 'text-ink-3 hover:text-ink'
                        )}
                      >
                        <Icon size={16} />
                      </button>
                    ))}
                  </div>
                </div>

                {results.length > 0 ? (
                  <motion.div
                    layout
                    className={cn(
                      view === 'grid'
                        ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
                        : 'flex flex-col gap-3'
                    )}
                  >
                    {results.map((v) => (
                      <VehicleCard key={v.id} vehicle={v} view={view} />
                    ))}
                  </motion.div>
                ) : (
                  <div className="glass grid place-items-center rounded-[20px] py-16 text-center">
                    <p className="text-ink-2">
                      No encontramos vehículos para “{query}”. Probá con otra marca, tipo o año.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
