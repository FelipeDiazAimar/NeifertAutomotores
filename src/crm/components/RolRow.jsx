import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import Button from '@/components/common/Button'
import { ROL_LABEL } from '@/crm/lib/vistas'
import VistasChecklist from './VistasChecklist'

const mismas = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

/** Acordeón de un rol: edita sus vistas por defecto. `onGuardar(rol, vistas)`. */
export default function RolRow({ rol, vistasDefault = [], onGuardar }) {
  const [borrador, setBorrador] = useState(vistasDefault)
  const sucio = !mismas(borrador, vistasDefault)

  return (
    <details className="glass group rounded-2xl">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
        <p className="flex-1 text-sm font-semibold text-ink">{ROL_LABEL[rol] ?? rol}</p>
        <span className="text-xs text-ink-3">{borrador.length} vistas</span>
        <ChevronDown size={18} className="shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
      </summary>

      <div className="space-y-4 border-t border-line p-4">
        <VistasChecklist value={borrador} onChange={setBorrador} />
        <p className="text-xs text-ink-3">
          Afecta a los usuarios de este rol que no tengan vistas propias.
        </p>
        <div className="flex justify-end">
          <Button size="sm" variant="primary" disabled={!sucio} onClick={() => onGuardar(rol, borrador)}>
            Guardar
          </Button>
        </div>
      </div>
    </details>
  )
}
