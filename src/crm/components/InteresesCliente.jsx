import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import Button from '@/components/common/Button'
import { useClienteMutations } from '@/crm/hooks/useClientes'

export default function InteresesCliente({ clienteId, intereses = [] }) {
  const { agregarInteres, quitarInteres } = useClienteMutations(clienteId)
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')

  function agregar(e) {
    e.preventDefault()
    if (!marca.trim()) return
    agregarInteres.mutate({ marca: marca.trim(), modelo: modelo.trim() || null }, {
      onSuccess: () => {
        setMarca('')
        setModelo('')
      },
    })
  }

  return (
    <div className="space-y-3">
      {intereses.length === 0 ? (
        <p className="text-sm text-ink-3">Sin intereses cargados.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {intereses.map((i) => (
            <li key={i.id} className="glass flex items-center gap-2 rounded-full px-3 py-1 text-sm text-ink">
              {[i.marca, i.modelo].filter(Boolean).join(' ')}
              <button
                onClick={() => quitarInteres.mutate(i.id)}
                aria-label={`Quitar ${i.marca}`}
                className="text-ink-3 hover:text-neifert"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={agregar} className="flex flex-wrap items-end gap-2">
        <input
          value={marca}
          onChange={(e) => setMarca(e.target.value)}
          placeholder="Marca"
          className="glass field-glass h-10 w-32 rounded-2xl px-3 text-sm text-ink outline-none"
        />
        <input
          value={modelo}
          onChange={(e) => setModelo(e.target.value)}
          placeholder="Modelo"
          className="glass field-glass h-10 w-32 rounded-2xl px-3 text-sm text-ink outline-none"
        />
        <Button type="submit" size="sm" icon={Plus} disabled={agregarInteres.isPending}>
          Agregar
        </Button>
      </form>
    </div>
  )
}
