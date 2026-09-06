import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import GlassCard from '@/components/common/GlassCard'
import { useClienteMutations } from '@/crm/hooks/useClientes'

const VACIO = { marca: '', modelo: '', version: '', anio: '', km: '', color: '', trans: '', notas: '' }

export default function AutosEntregaCliente({ clienteId, autos = [] }) {
  const { agregarAutoEntrega, quitarAutoEntrega } = useClienteMutations(clienteId)
  const [form, setForm] = useState(VACIO)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  function agregar(e) {
    e.preventDefault()
    if (!form.marca.trim()) return
    agregarAutoEntrega.mutate(
      {
        marca: form.marca.trim(),
        modelo: form.modelo.trim() || null,
        version: form.version.trim() || null,
        anio: form.anio ? Number(form.anio) : null,
        km: form.km ? Number(form.km) : null,
        color: form.color.trim() || null,
        trans: form.trans.trim() || null,
        notas: form.notas.trim() || null,
      },
      { onSuccess: () => setForm(VACIO) },
    )
  }

  return (
    <div className="space-y-3">
      {autos.length === 0 ? (
        <p className="text-sm text-ink-3">Sin autos en entrega.</p>
      ) : (
        <ul className="space-y-2">
          {autos.map((a) => (
            <li key={a.id}>
              <GlassCard className="flex items-center justify-between gap-3 p-3">
                <div className="text-sm">
                  <p className="font-semibold text-ink">{[a.marca, a.modelo, a.version].filter(Boolean).join(' ')}</p>
                  <p className="text-xs text-ink-3">
                    {[a.anio, a.km && `${a.km} km`, a.color, a.trans].filter(Boolean).join(' · ')}
                    {a.notas ? ` — ${a.notas}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => quitarAutoEntrega.mutate(a.id)}
                  aria-label="Quitar auto"
                  className="shrink-0 text-ink-3 hover:text-neifert"
                >
                  <Trash2 size={16} />
                </button>
              </GlassCard>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={agregar} className="grid gap-2 sm:grid-cols-3">
        <Input label="Marca" value={form.marca} onChange={(e) => set('marca', e.target.value)} />
        <Input label="Modelo" value={form.modelo} onChange={(e) => set('modelo', e.target.value)} />
        <Input label="Versión" value={form.version} onChange={(e) => set('version', e.target.value)} />
        <Input label="Año" type="number" value={form.anio} onChange={(e) => set('anio', e.target.value)} />
        <Input label="Km" type="number" value={form.km} onChange={(e) => set('km', e.target.value)} />
        <Input label="Color" value={form.color} onChange={(e) => set('color', e.target.value)} />
        <Input label="Transmisión" value={form.trans} onChange={(e) => set('trans', e.target.value)} />
        <Input label="Notas" value={form.notas} onChange={(e) => set('notas', e.target.value)} />
        <div className="flex items-end">
          <Button type="submit" size="sm" icon={Plus} disabled={agregarAutoEntrega.isPending}>
            Agregar
          </Button>
        </div>
      </form>
    </div>
  )
}
