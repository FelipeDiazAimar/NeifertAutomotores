import { useRef, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, Play, RefreshCw, Layers, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { InstagramIcon } from '@/components/common/SocialIcons'
import Button from '@/components/common/Button'
import { useSiteStore } from '@/store/useSiteStore'
import { fetchInstagramPage } from '@/services/instagram.service'
import { fadeUp, staggerContainer } from '@/lib/animations'
import { cn } from '@/lib/cn'

function CarouselIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
      <path d="M2 6h15v11H2z M19 8h3v7h-3z" opacity=".6" />
      <rect x="2" y="6" width="15" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function TypeBadge({ type }) {
  if (type === 'image') return null
  return (
    <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md">
      {type === 'video' ? <Play size={13} className="ml-0.5" fill="currentColor" /> : <CarouselIcon />}
    </span>
  )
}

function GalleryItem({ post }) {
  return (
    <motion.a
      variants={fadeUp}
      href={post.url}
      target="_blank"
      rel="noreferrer"
      whileHover={{ y: -4 }}
      className="group relative aspect-square overflow-hidden rounded-[18px] bg-surface shadow-glass"
    >
      {post.thumb ? (
        <img
          src={post.thumb}
          alt={post.caption ? post.caption.slice(0, 80) : 'Instagram post'}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
            e.currentTarget.nextSibling?.classList?.remove('hidden')
          }}
        />
      ) : null}
      <div className={cn(
        'absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a1a20] to-[#0b0b0f]',
        post.thumb ? 'hidden' : ''
      )}>
        <InstagramIcon size={28} className="opacity-30 text-white" />
      </div>

      <TypeBadge type={post.type} />

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="absolute inset-x-3 bottom-3 translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
        {post.caption && (
          <p className="line-clamp-3 text-xs font-medium leading-relaxed text-white drop-shadow">
            {post.caption}
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

/** Control de paginación numerada. Con cursores de Instagram solo se puede
 *  avanzar de a una página; las ya cargadas quedan navegables hacia atrás. */
function Pagination({ pageIdx, loadedPages, hasNext, loading, onGo, onNext, onPrev }) {
  const pillBase =
    'grid h-9 min-w-9 place-items-center rounded-full px-3 text-sm font-semibold transition-colors'
  return (
    <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
      <button
        onClick={onPrev}
        disabled={pageIdx === 0}
        aria-label="Página anterior"
        className={cn(pillBase, 'glass text-ink-2 hover:text-neifert disabled:opacity-40')}
      >
        <ChevronLeft size={18} />
      </button>

      {Array.from({ length: loadedPages }).map((_, i) => (
        <button
          key={i}
          onClick={() => onGo(i)}
          className={cn(
            pillBase,
            i === pageIdx ? 'bg-neifert text-white shadow-glow-red' : 'glass text-ink-2 hover:text-neifert'
          )}
        >
          {i + 1}
        </button>
      ))}

      <button
        onClick={onNext}
        disabled={loading || (pageIdx >= loadedPages - 1 && !hasNext)}
        aria-label="Página siguiente"
        className={cn(pillBase, 'glass text-ink-2 hover:text-neifert disabled:opacity-40')}
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={18} />}
      </button>
    </div>
  )
}

export default function InstagramPage() {
  const instagram = useSiteStore((s) => s.instagram)
  const socials = useSiteStore((s) => s.socials)
  const gridRef = useRef(null)
  const [pageIdx, setPageIdx] = useState(0)

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    isFetching,
  } = useInfiniteQuery({
    queryKey: ['instagram-posts'],
    queryFn: fetchInstagramPage,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: 1,
  })

  const pages = data?.pages ?? []
  const posts = pages[pageIdx]?.posts ?? []
  const handle = (socials.instagram || '').split('/').filter(Boolean).pop() || 'neifertautomotores'

  const scrollToTop = () =>
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const goTo = (i) => {
    setPageIdx(i)
    scrollToTop()
  }
  const goPrev = () => {
    if (pageIdx > 0) goTo(pageIdx - 1)
  }
  const goNext = async () => {
    if (pageIdx < pages.length - 1) {
      goTo(pageIdx + 1)
    } else if (hasNextPage) {
      await fetchNextPage()
      setPageIdx((i) => i + 1)
      scrollToTop()
    }
  }

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
          <a href={socials.instagram || `https://www.instagram.com/${handle}`} target="_blank" rel="noreferrer">
            <Button icon={InstagramIcon} iconRight={ExternalLink}>
              Ver perfil en Instagram
            </Button>
          </a>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title="Actualizar publicaciones"
            className="grid h-10 w-10 place-items-center rounded-full glass text-ink-2 transition-colors hover:text-neifert disabled:opacity-50"
          >
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </motion.div>

        <AnimatePresence>
          {!isLoading && posts.length > 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-3 text-sm text-ink-3"
            >
              Página {pageIdx + 1} · {posts.length} publicaciones
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Grid */}
      <div ref={gridRef} className="mt-12 scroll-mt-24">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => <SkeletonItem key={i} />)}
          </div>
        ) : posts.length > 0 ? (
          <motion.div
            key={pageIdx}
            variants={staggerContainer(0.03)}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4"
          >
            {posts.map((post) => (
              <GalleryItem key={post.id} post={post} />
            ))}
          </motion.div>
        ) : (
          <div className="glass rounded-[20px] py-20 text-center">
            <Layers size={40} className="mx-auto mb-4 text-ink-3" />
            <p className="text-ink-3">No se pudieron cargar las publicaciones.</p>
            <button
              onClick={() => refetch()}
              className="mt-4 rounded-full bg-neifert px-4 py-2 text-sm font-semibold text-white"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>

      {/* Paginación */}
      {!isLoading && pages.length > 0 && (
        <Pagination
          pageIdx={pageIdx}
          loadedPages={pages.length}
          hasNext={hasNextPage}
          loading={isFetchingNextPage}
          onGo={goTo}
          onNext={goNext}
          onPrev={goPrev}
        />
      )}
    </section>
  )
}
