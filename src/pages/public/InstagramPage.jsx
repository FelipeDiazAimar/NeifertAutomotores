import { useEffect, useRef, useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, Play, RefreshCw, Layers } from 'lucide-react'
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

function LoadingRow() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => <SkeletonItem key={i} />)}
    </div>
  )
}

export default function InstagramPage() {
  const instagram = useSiteStore((s) => s.instagram)
  const socials = useSiteStore((s) => s.socials)
  const sentinelRef = useRef(null)

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

  const posts = data?.pages.flatMap((p) => p.posts) ?? []
  const handle = (socials.instagram || '').split('/').filter(Boolean).pop() || 'neifertautomotores'

  // Infinite scroll: carga la siguiente página cuando el sentinel entra en el viewport
  const onIntersect = useCallback(
    ([entry]) => {
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  )

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(onIntersect, { rootMargin: '300px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [onIntersect])

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
              {posts.length} publicaciones cargadas
              {hasNextPage && ' · cargando más…'}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Grid */}
      <div className="mt-12 space-y-3 md:space-y-4">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => <SkeletonItem key={i} />)}
          </div>
        ) : posts.length > 0 ? (
          <motion.div
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

        {/* Sentinel + spinner de carga de página siguiente */}
        <div ref={sentinelRef} className="h-4" />
        {isFetchingNextPage && <LoadingRow />}
      </div>
    </section>
  )
}
