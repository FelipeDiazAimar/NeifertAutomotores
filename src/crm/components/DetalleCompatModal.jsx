import { Check, X, Minus } from 'lucide-react'
import Modal from '@/components/common/Modal'
import Button from '@/components/common/Button'
import { WhatsAppIcon } from '@/components/common/SocialIcons'
import { waContactoLink } from '@/crm/lib/formatCliente'
import CompatBar from './CompatBar'

const BUCKET_LABEL = { alta: 'Alta compatibilidad', media: 'Media compatibilidad', baja: 'Baja compatibilidad' }

export default function DetalleCompatModal({ open, onClose, cliente, vehiculo, resultado }) {
  if (!resultado) return null
  const { score, bucket, detalle } = resultado
  const wa = waContactoLink(cliente)
  const subtitulo = `${cliente?.nombre ?? ''} · ${vehiculo?.marca ?? ''} ${vehiculo?.modelo ?? ''} ${vehiculo?.anio ?? ''}`
    .replace(/\s+/g, ' ')
    .trim()

  return (
    <Modal open={open} onClose={onClose} title="Detalle de compatibilidad">
      <div className="space-y-4">
        {subtitulo && <p className="-mt-2 text-sm text-ink-3">{subtitulo}</p>}

        <div className="flex items-center gap-3">
          <CompatBar score={score} bucket={bucket} />
          <span className="text-sm font-semibold text-ink">{BUCKET_LABEL[bucket]}</span>
        </div>

        <ul className="space-y-2">
          {detalle.map((d) => (
            <li key={d.key} className="rounded-2xl border border-line p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-ink">
                {!d.aplica ? (
                  <Minus size={15} className="text-ink-3" />
                ) : d.ok ? (
                  <Check size={15} className="text-success" />
                ) : (
                  <X size={15} className="text-neifert" />
                )}
                {d.label}
              </div>
              {d.aplica && (
                <div className="mt-1 space-y-0.5 text-xs text-ink-3">
                  <p>Cliente busca: {String(d.clienteDice ?? '—')}</p>
                  <p>Vehículo: {String(d.vehiculoDice ?? '—')}</p>
                </div>
              )}
            </li>
          ))}
        </ul>

        {cliente?.notas && (
          <div className="rounded-2xl border border-line p-3">
            <p className="text-[11px] uppercase tracking-wide text-ink-3">Notas del cliente</p>
            <p className="text-sm text-ink">{cliente.notas}</p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-whatsapp px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              <WhatsAppIcon size={16} /> WhatsApp
            </a>
          )}
          <Button variant="glass" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
