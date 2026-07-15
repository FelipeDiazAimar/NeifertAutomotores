import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, Play, RefreshCw, Layers, ChevronLeft, ChevronRight } from 'lucide-react'
import { InstagramIcon } from '@/components/common/SocialIcons'
import Button from '@/components/common/Button'
import { useSiteStore, hydrateSiteContent } from '@/store/useSiteStore'
import { fadeUp, staggerContainer } from '@/lib/animations'
import { cn } from '@/lib/cn'

const PAGE_SIZE = 24

function TypeBadge({ type }) {
  if (type === 'image') return null
  return (
    <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md">
      <Play size={13} className="ml-0.5" fill="currentColor" />
    </span>
  )
}

function GalleryItem({ item, profileUrl }) {
  return (
    <motion.a
      variants={fadeUp}
      href={item.link || profileUrl}
      target="_blank"
      rel="noreferrer"
      whileHover={{ y: -4 }}
      className="group relative aspect-square overflow-hidden rounded-[18px] bg-surface shadow-glass"
    >
      {item.url ? (
        <img
          src={item.url}
          alt={item.caption ? item.caption.slice(0, 80) : 'Instagram post'}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
            e.currentTarget.nextSibling?.classList?.remove('hidden')
          }}
        />
      ) : null}
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a1a20] to-[#0b0b0f]',
          item.url ? 'hidden' : ''
        )}
      >
        <InstagramIcon size={28} className="opacity-30 text-white" />
      </div>

      <TypeBadge type={item.type} />

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="absolute inset-x-3 bottom-3 translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
        {item.caption && (
          <p className="line-clamp-3 text-xs font-medium leading-relaxed text-white drop-shadow">
            {item.caption}
          </p>
        )}
        <div className="mt-1.5 flex items-center justify-end gap-1 text-white/70">
          <ExternalLink size={12} />
          <span className="text-[10px]">Ver en Instagram</span>
        </div>
      </div>
    </motion.a>
  )
}

function SkeletonItem() {
  return <div className="aspect-square animate-pulse rounded-[18px] bg-surface/60" />
}

/** Paginación numerada simple sobre el array ya sincronizado (sin cursores:
 *  los posteos vienen de nuestro storage, no de un scrape en vivo). */
function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null
  const pillBase =
    'grid h-9 min-w-9 place-items-center rounded-full px-3 text-sm font-semibold transition-colors'
  return (
    <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Página anterior"
        className={cn(pillBase, 'glass text-ink-2 hover:text-neifert disabled:opacity-40')}
      >
        <ChevronLeft size={18} />
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={cn(
            pillBase,
            p === page ? 'bg-neifert text-white shadow-glow-red' : 'glass text-ink-2 hover:text-neifert'
          )}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Página siguiente"
        className={cn(pillBase, 'glass text-ink-2 hover:text-neifert disabled:opacity-40')}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}

export default function InstagramPage() {
  const instagram = useSiteStore((s) => s.instagram)
  const socials = useSiteStore((s) => s.socials)
  const gridRef = useRef(null)
  const [page, setPage] = useState(1)
  const [refreshing, setRefreshing] = useState(false)

  const items = instagram.items || []
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const pageItems = useMemo(
    () => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [items, page]
  )

  const handle = (socials.instagram || '').split('/').filter(Boolean).pop() || 'neifertautomotores'
  const profileUrl = socials.instagram || `https://www.instagram.com/${handle}`

  const goTo = (p) => {
    setPage(Math.min(Math.max(p, 1), totalPages))
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await hydrateSiteContent()
    setRefreshing(false)
  }

  // Si el feed se sincronizó recién y esta pestaña ya estaba abierta, refresca sola.
  useEffect(() => {
    setPage(1)
  }, [items.length])

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8">
      {/* Encabezado */}
      <motion.div
        variants={staggerContainer(0.1, 0.05)}
        initial="hidden"
        animate="show"
        className="text-center"
      >
        <motion.span
          variants={fadeUp}
          className="inline-flex items-center gap-2 rounded-full bg-neifert/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-neifert"
        >
          <InstagramIcon size={14} /> @{handle}
        </motion.span>

        <motion.h1
          variants={fadeUp}
          className="mt-5 font-display text-4xl font-extrabold leading-tight text-ink md:text-5xl"
        >
          {instagram.headline}
        </motion.h1>

        <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-xl text-ink-2 md:text-lg">
          {instagram.subtitle}
        </motion.p>

        <motion.div variants={fadeUp} className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a href={profileUrl} target="_blank" rel="noreferrer">
            <Button icon={InstagramIcon} iconRight={ExternalLink}>
              Ver perfil en Instagram
            </Button>
          </a>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            title="Actualizar publicaciones"
            className="grid h-10 w-10 place-items-center rounded-full glass text-ink-2 transition-colors hover:text-neifert disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </motion.div>

        <AnimatePresence>
          {items.length > 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-3 text-sm text-ink-3"
            >
              Página {page} de {totalPages} · {items.length} publicaciones
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Grid */}
      <div ref={gridRef} className="mt-12 scroll-mt-24">
        {refreshing ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => <SkeletonItem key={i} />)}
          </div>
        ) : pageItems.length > 0 ? (
          <motion.div
            key={page}
            variants={staggerContainer(0.03)}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4"
          >
            {pageItems.map((item) => (
              <GalleryItem key={item.id} item={item} profileUrl={profileUrl} />
            ))}
          </motion.div>
        ) : (
          <div className="glass rounded-[20px] py-20 text-center">
            <Layers size={40} className="mx-auto mb-4 text-ink-3" />
            <p className="text-ink-3">Todavía no hay publicaciones cargadas.</p>
          </div>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={goTo} />
    </section>
  )
}
