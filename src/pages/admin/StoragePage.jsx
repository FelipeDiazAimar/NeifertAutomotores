import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Image, Film, HardDrive, AlertTriangle, Server } from 'lucide-react'
import GlassCard from '@/components/common/GlassCard'
import Spinner from '@/components/common/Spinner'
import { cn } from '@/lib/cn'

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

async function fetchStorageStats() {
  const res = await fetch('/api/r2/stats')
  if (res.status === 501) throw new Error('NOT_CONFIGURED')
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Error ${res.status}`)
  }
  return res.json()
}

export default function StoragePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['r2-stats'],
    queryFn: fetchStorageStats,
    refetchInterval: 30_000,
  })

  const configured = error?.message !== 'NOT_CONFIGURED'

  const imagePct = data ? (data.imageSize / data.limitBytes) * 100 : 0
  const videoPct = data ? (data.videoSize / data.limitBytes) * 100 : 0
  const otherPct = data ? (data.otherSize / data.limitBytes) * 100 : 0
  const freePct = data ? Math.max(0, 100 - imagePct - videoPct - otherPct) : 100

  const usagePct = data ? ((data.totalSize / data.limitBytes) * 100).toFixed(1) : 0
  const isWarning = Number(usagePct) >= 95
  const isFull = Number(usagePct) >= 100

  const warnedRef = useRef(false)
  useEffect(() => {
    if (isWarning && !warnedRef.current) {
      warnedRef.current = true
      toast.warning(
        isFull
          ? 'El almacenamiento R2 está lleno. No se aceptarán más archivos hasta liberar espacio.'
          : `Almacenamiento R2 al ${usagePct}%. Queda poco espacio.`,
        { id: 'r2-storage-warning', duration: Infinity, dismissible: true }
      )
    }
    if (!isWarning) {
      warnedRef.current = false
      toast.dismiss('r2-storage-warning')
    }
  }, [isWarning, isFull, usagePct])

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-neifert">Infraestructura</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold text-ink">Almacenamiento</h1>
        <p className="mt-1 text-sm text-ink-3">
          Monitoreo del espacio ocupado en Cloudflare R2.
        </p>
      </header>

      {!configured && (
        <GlassCard className="flex items-start gap-4 p-6">
          <Server className="mt-0.5 shrink-0 text-ink-3" size={24} />
          <div>
            <h3 className="font-semibold text-ink">R2 no configurado</h3>
            <p className="mt-1 text-sm text-ink-3">
              Las variables de entorno <code className="rounded bg-line px-1 py-0.5 text-xs">R2_*</code> no
              están definidas en el servidor. El monitoreo solo está disponible cuando Cloudflare R2 está
              conectado.
            </p>
          </div>
        </GlassCard>
      )}

      {configured && isLoading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size={40} />
        </div>
      )}

      {configured && error && error.message !== 'NOT_CONFIGURED' && (
        <GlassCard className="flex items-start gap-4 p-6">
          <AlertTriangle className="mt-0.5 shrink-0 text-red-500" size={24} />
          <div>
            <h3 className="font-semibold text-ink">Error al obtener estadísticas</h3>
            <p className="mt-1 text-sm text-ink-3">{error.message}</p>
          </div>
        </GlassCard>
      )}

      {configured && data && (
        <>
          {isWarning && (
            <GlassCard
              className={cn(
                'flex items-start gap-4 p-5',
                isFull
                  ? 'border-2 border-red-500/50 bg-red-500/10'
                  : 'border-2 border-amber-500/50 bg-amber-500/10'
              )}
            >
              <AlertTriangle
                className={cn('mt-0.5 shrink-0', isFull ? 'text-red-500' : 'text-amber-500')}
                size={24}
              />
              <div>
                <h3 className={cn('font-semibold', isFull ? 'text-red-600' : 'text-amber-600')}>
                  {isFull
                    ? 'Almacenamiento lleno'
                    : 'Almacenamiento casi lleno'}
                </h3>
                <p className="mt-1 text-sm text-ink-3">
                  {isFull
                    ? 'Se alcanzó el límite de almacenamiento en Cloudflare R2. No se permiten nuevas subidas de archivos hasta que se libere espacio eliminando imágenes o videos innecesarios.'
                    : `El almacenamiento de Cloudflare R2 está al ${usagePct}%. Cuando llegue al 100% se bloquearán las subidas de nuevos archivos.`}
                </p>
              </div>
            </GlassCard>
          )}

          {/* Total usage bar */}
          <GlassCard className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Uso total</h3>
              <span className="text-sm font-bold text-neifert">
                {formatBytes(data.totalSize)} / {formatBytes(data.limitBytes)}
              </span>
            </div>

            <div className="h-5 w-full overflow-hidden rounded-full bg-line">
              <div className="relative h-full">
                {imagePct > 0 && (
                  <div
                    className="absolute inset-y-0 left-0 bg-blue-500 transition-all"
                    style={{ width: `${imagePct}%` }}
                  />
                )}
                {videoPct > 0 && (
                  <div
                    className="absolute inset-y-0 bg-purple-500 transition-all"
                    style={{ left: `${imagePct}%`, width: `${videoPct}%` }}
                  />
                )}
                {otherPct > 0 && (
                  <div
                    className="absolute inset-y-0 bg-amber-500 transition-all"
                    style={{ left: `${imagePct + videoPct}%`, width: `${otherPct}%` }}
                  />
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
                <span className="text-ink-3">
                  Imágenes{' '}
                  <span className="font-medium text-ink">
                    {formatBytes(data.imageSize)} ({imagePct.toFixed(1)}%)
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-purple-500" />
                <span className="text-ink-3">
                  Videos{' '}
                  <span className="font-medium text-ink">
                    {formatBytes(data.videoSize)} ({videoPct.toFixed(1)}%)
                  </span>
                </span>
              </div>
              {otherPct > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
                  <span className="text-ink-3">
                    Otros{' '}
                    <span className="font-medium text-ink">
                      {formatBytes(data.otherSize)} ({otherPct.toFixed(1)}%)
                    </span>
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-line" />
                <span className="text-ink-3">
                  Libre{' '}
                  <span className="font-medium text-ink">
                    {formatBytes(data.limitBytes - data.totalSize)} ({freePct.toFixed(1)}%)
                  </span>
                </span>
              </div>
            </div>

            <div className="text-center">
              <span
                className={cn(
                  'inline-block rounded-full px-3 py-1 text-xs font-semibold',
                  Number(usagePct) > 90
                    ? 'bg-red-500/15 text-red-600'
                    : Number(usagePct) > 70
                      ? 'bg-amber-500/15 text-amber-600'
                      : 'bg-emerald-500/15 text-emerald-600'
                )}
              >
                {usagePct}% utilizado
              </span>
            </div>
          </GlassCard>

          {/* Stats cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <GlassCard className="flex items-start gap-4 p-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/15">
                <Image size={20} className="text-blue-500" />
              </span>
              <div>
                <p className="text-xs font-medium text-ink-3">Imágenes</p>
                <p className="text-lg font-bold text-ink">{data.imageCount}</p>
                <p className="text-xs text-ink-3">{formatBytes(data.imageSize)}</p>
              </div>
            </GlassCard>

            <GlassCard className="flex items-start gap-4 p-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-500/15">
                <Film size={20} className="text-purple-500" />
              </span>
              <div>
                <p className="text-xs font-medium text-ink-3">Videos</p>
                <p className="text-lg font-bold text-ink">{data.videoCount}</p>
                <p className="text-xs text-ink-3">{formatBytes(data.videoSize)}</p>
              </div>
            </GlassCard>

            <GlassCard className="flex items-start gap-4 p-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/15">
                <HardDrive size={20} className="text-amber-500" />
              </span>
              <div>
                <p className="text-xs font-medium text-ink-3">Otros archivos</p>
                <p className="text-lg font-bold text-ink">{data.otherCount}</p>
                <p className="text-xs text-ink-3">{formatBytes(data.otherSize)}</p>
              </div>
            </GlassCard>

            <GlassCard className="flex items-start gap-4 p-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15">
                <HardDrive size={20} className="text-emerald-500" />
              </span>
              <div>
                <p className="text-xs font-medium text-ink-3">Total</p>
                <p className="text-lg font-bold text-ink">{data.totalObjects}</p>
                <p className="text-xs text-ink-3">{formatBytes(data.totalSize)}</p>
              </div>
            </GlassCard>
          </div>
        </>
      )}
    </div>
  )
}
