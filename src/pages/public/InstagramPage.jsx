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
      className="group relative aspect-[3/4] overflow-hidden bg-line"
    >
      {item.url ? (
        <img
          src={item.url}
          alt={item.caption ? item.caption.slice(0, 80) : 'Instagram post'}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-opacity duration-200 group-hover:opacity-80"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
            e.currentTarget.nextSibling?.classList?.remove('hidden')
          }}
        />
      ) : null}
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center bg-line',
          item.url ? 'hidden' : ''
        )}
      >
        <InstagramIcon size={28} className="opacity-20 text-ink-3" />
      </div>

      <TypeBadge type={item.type} />
    </motion.a>
  )
}

function SkeletonItem() {
  return <div className="aspect-[3/4] animate-pulse bg-line" />
}

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null
  const pillBase =
    'grid h-9 shrink-0 place-items-center rounded-full px-3 text-sm font-semibold transition-colors'

  const visible = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) visible.push(i)
  } else {
    visible.push(1)
    if (page > 3) visible.push('...')
    const start = Math.max(2, page - 1)
    const end = Math.min(totalPages - 1, page + 1)
    for (let i = start; i <= end; i++) visible.push(i)
    if (page < totalPages - 2) visible.push('...')
    visible.push(totalPages)
  }

  return (
    <div className="mt-8 flex items-center justify-center gap-1 overflow-x-auto px-2">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Página anterior"
        className={cn(pillBase, 'glass text-ink-2 hover:text-neifert disabled:opacity-30')}
      >
        <ChevronLeft size={18} />
      </button>
      {visible.map((p, i) =>
        p === '...' ? (
          <span key={`dots-${i}`} className="grid h-9 w-9 shrink-0 place-items-center text-xs text-ink-3">
            ...
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={cn(
              pillBase,
              p === page
                ? 'bg-neifert text-white shadow-glow-red'
                : 'glass text-ink-2 hover:text-neifert'
            )}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Página siguiente"
        className={cn(pillBase, 'glass text-ink-2 hover:text-neifert disabled:opacity-30')}
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

  useEffect(() => {
    setPage(1)
  }, [items.length])

  return (
    <section className="mx-auto max-w-[1130px] px-4 py-12 md:px-8">
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

      <div ref={gridRef} className="mt-12 scroll-mt-24">
        {refreshing ? (
          <div className="grid grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <SkeletonItem key={i} />
            ))}
          </div>
        ) : pageItems.length > 0 ? (
          <motion.div
            key={page}
            variants={staggerContainer(0.015)}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-4"
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
