import { Check, X, Minus } from 'lucide-react'
import Modal from '@/components/common/Modal'
import CompatBar from './CompatBar'

const BUCKET_LABEL = { alta: 'Alta compatibilidad', media: 'Media compatibilidad', baja: 'Baja compatibilidad' }

export default function DetalleCompatModal({ open, onClose, cliente, vehiculo, resultado }) {
  if (!resultado) return null
  const { score, bucket, detalle } = resultado

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${cliente?.nombre ?? ''} · ${vehiculo?.marca ?? ''} ${vehiculo?.modelo ?? ''} ${vehiculo?.anio ?? ''}`.trim()}
    >
      <div className="space-y-4">
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
                <div className="mt-1 text-xs text-ink-3">
                  <span>Cliente busca: {String(d.clienteDice ?? '—')}</span>
                  <span className="mx-2">·</span>
                  <span>Vehículo: {String(d.vehiculoDice ?? '—')}</span>
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
      </div>
    </Modal>
  )
}
