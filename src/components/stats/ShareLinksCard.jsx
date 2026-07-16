import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import GlassCard from '@/components/common/GlassCard'
import { SOURCE_COLORS } from '@/lib/provenance'

/** Enlaces marcados por canal (?ref=...) para pegar en cada red/medio y que
 *  "Vistas por procedencia" sepa de dónde vino cada visita, en vez de
 *  depender solo del referrer del navegador. */
const CHANNELS = [
  { key: 'instagram', source: 'Instagram', hint: 'Bio o stories de Instagram' },
  { key: 'facebook', source: 'Facebook', hint: 'Publicaciones de Facebook' },
  { key: 'whatsapp', source: 'WhatsApp', hint: 'Estados o grupos de WhatsApp' },
  { key: 'web', source: 'Web', hint: 'Otras webs, notas de prensa, etc' },
]

export default function ShareLinksCard() {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const copy = async (url) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Enlace copiado')
    } catch {
      toast.error('No se pudo copiar el enlace')
    }
  }

  return (
    <GlassCard className="p-5">
      <div className="mb-4">
        <h2 className="font-display text-lg font-bold text-ink">Enlaces por canal</h2>
        <p className="text-xs text-ink-3">
          Compartí cada enlace solo desde su canal correspondiente — así "Vistas por procedencia"
          sabe de dónde vino cada visita.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {CHANNELS.map(({ key, source, hint }) => {
          const url = `${origin}/?ref=${key}`
          return (
            <div key={key} className="glass flex items-center gap-3 rounded-xl p-3">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: SOURCE_COLORS[source] }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink">{source}</p>
                <p className="truncate text-xs text-ink-3" title={hint}>
                  {url}
                </p>
              </div>
              <button
                onClick={() => copy(url)}
                aria-label={`Copiar enlace de ${source}`}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:text-neifert"
              >
                <Copy size={13} /> Copiar
              </button>
            </div>
          )
        })}
      </div>
    </GlassCard>
  )
}
