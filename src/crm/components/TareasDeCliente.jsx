import { useState } from 'react'
import { Plus } from 'lucide-react'
import Button from '@/components/common/Button'
import Spinner from '@/components/common/Spinner'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import { useTareas, useTareaMutations } from '@/crm/hooks/useTareas'
import TareaRow from '@/crm/components/TareaRow'
import TareaFormModal from '@/crm/components/TareaFormModal'

export default function TareasDeCliente({ clienteId }) {
  const { esAdmin } = useCrmPerfil()
  const [modal, setModal] = useState({ open: false, tarea: null })
  const { data: tareas = [], isLoading } = useTareas({ filtros: { clienteId }, incluirHechas: true })
  const { toggleDone, archivar, eliminar } = useTareaMutations()

  const filaProps = {
    onToggle: (t, done) => toggleDone.mutate({ id: t.id, done }),
    onEditar: (t) => setModal({ open: true, tarea: t }),
    onArchivar: (id) => archivar.mutate(id),
    onEliminar: (id) => eliminar.mutate(id),
    puedeEliminar: esAdmin,
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" icon={Plus} onClick={() => setModal({ open: true, tarea: null })}>
          Nueva tarea
        </Button>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-8">
          <Spinner size={22} />
        </div>
      ) : tareas.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-3">Sin tareas para este cliente.</p>
      ) : (
        <div className="space-y-2">
          {tareas.map((t) => (
            <TareaRow key={t.id} tarea={t} {...filaProps} />
          ))}
        </div>
      )}

      <TareaFormModal
        open={modal.open}
        tarea={modal.tarea}
        clienteFijo={modal.tarea ? undefined : clienteId}
        onClose={() => setModal({ open: false, tarea: null })}
      />
    </div>
  )
}
