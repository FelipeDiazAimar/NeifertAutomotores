import { useMemo, useState } from 'react'
import Modal from '@/components/common/Modal'
import Button from '@/components/common/Button'
import Spinner from '@/components/common/Spinner'
import { useVehiculos } from '@/crm/hooks/useVehiculos'
import { useClienteMutations } from '@/crm/hooks/useClientes'
import { lineaSpecs, precioFmt } from '@/crm/lib/formatVehiculo'
import { cn } from '@/lib/cn'

export default function RegistrarVentaModal({ clienteId, open, onClose }) {
  const { registrarVenta } = useClienteMutations(clienteId)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)

  const { data, isLoading } = useVehiculos({
    filtros: { estado: ['disponible'] },
    pageSize: 200,
    incluirArchivados: false,
  })
  const filtrados = useMemo(() => {
    const todos = data?.filas ?? []
    const t = q.trim().toLowerCase()
    if (!t) return todos
    return todos.filter((v) => `${v.marca} ${v.modelo} ${v.patente ?? ''}`.toLowerCase().includes(t))
  }, [data, q])

  function confirmar() {
    if (!sel) return
    registrarVenta.mutate(
      { vehiculoId: sel.id, estadoVehiculo: sel.estado },
      {
        onSuccess: () => {
          setSel(null)
          setQ('')
          onClose()
        },
      },
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar venta">
      <div className="space-y-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar vehículo disponible…"
          className="glass field-glass h-11 w-full rounded-2xl px-3.5 text-sm text-ink outline-none placeholder:text-ink-3"
        />

        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {isLoading ? (
            <div className="grid place-items-center py-8">
              <Spinner size={22} />
            </div>
          ) : filtrados.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-3">Sin vehículos disponibles.</p>
          ) : (
            filtrados.map((v) => {
              const p = precioFmt(v)
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSel(v)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left text-sm transition-colors',
                    sel?.id === v.id ? 'bg-neifert text-white' : 'glass text-ink hover:bg-surface',
                  )}
                >
                  <span>
                    <span className="font-semibold">{v.marca} {v.modelo}</span>{' '}
                    <span className={sel?.id === v.id ? 'text-white/80' : 'text-ink-3'}>{lineaSpecs(v)}</span>
                  </span>
                  <span className={sel?.id === v.id ? 'text-white/90' : 'text-ink-2'}>
                    {p.monto} {p.moneda}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!sel || registrarVenta.isPending}>
            {registrarVenta.isPending ? 'Registrando…' : 'Confirmar venta'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
