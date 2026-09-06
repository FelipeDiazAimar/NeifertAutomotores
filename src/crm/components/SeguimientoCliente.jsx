import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { MessageCircle } from 'lucide-react'
import Button from '@/components/common/Button'
import Spinner from '@/components/common/Spinner'
import { useEventos } from '@/crm/hooks/useEventos'
import { useClienteMutations } from '@/crm/hooks/useClientes'

export default function SeguimientoCliente({ clienteId }) {
  const { data: eventos = [], isLoading } = useEventos('cliente', clienteId)
  const { agregarContacto } = useClienteMutations(clienteId)
  const [texto, setTexto] = useState('')

  const contactos = eventos.filter((e) => e.tipo === 'contacto')

  function enviar(e) {
    e.preventDefault()
    const t = texto.trim()
    if (!t) return
    agregarContacto.mutate(t, { onSuccess: () => setTexto('') })
  }

  return (
    <div className="space-y-4">
      <form onSubmit={enviar} className="space-y-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Anotá un contacto: llamé, mandé fotos, vino al salón…"
          className="glass field-glass min-h-20 w-full resize-none rounded-2xl p-3 text-sm text-ink outline-none placeholder:text-ink-3"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" icon={MessageCircle} disabled={agregarContacto.isPending}>
            Agregar contacto
          </Button>
        </div>
      </form>

      {isLoading ? (
        <div className="grid place-items-center py-8">
          <Spinner size={24} />
        </div>
      ) : contactos.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-3">Todavía no hay contactos registrados.</p>
      ) : (
        <ul className="space-y-3">
          {contactos.map((c) => (
            <li key={c.id} className="border-l-2 border-line pl-3">
              <p className="text-sm text-ink">{c.datos?.texto}</p>
              <p className="text-xs text-ink-3">
                {c.usuario?.nombre ?? 'Alguien'} ·{' '}
                {formatDistanceToNow(new Date(c.creado_en), { addSuffix: true, locale: es })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
