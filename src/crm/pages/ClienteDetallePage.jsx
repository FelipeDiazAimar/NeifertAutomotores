import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useLenis } from 'lenis/react'
import Spinner from '@/components/common/Spinner'
import { useCliente, useClienteMutations } from '@/crm/hooks/useClientes'
import FichaCliente from '@/crm/components/FichaCliente'
import InteresesCliente from '@/crm/components/InteresesCliente'
import AutosEntregaCliente from '@/crm/components/AutosEntregaCliente'
import SeguimientoCliente from '@/crm/components/SeguimientoCliente'
import TareasDeCliente from '@/crm/components/TareasDeCliente'
import RegistrarVentaModal from '@/crm/components/RegistrarVentaModal'
import HistorialTimeline from '@/crm/components/HistorialTimeline'

const SECCIONES = [
  { id: 'datos', label: 'Datos' },
  { id: 'intereses', label: 'Intereses' },
  { id: 'autos', label: 'Autos en entrega' },
  { id: 'seguimiento', label: 'Seguimiento' },
  { id: 'tareas', label: 'Tareas' },
  { id: 'historial', label: 'Historial' },
]

function Seccion({ id, titulo, children }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="font-display text-lg font-bold text-ink">{titulo}</h2>
      {children}
    </section>
  )
}

export default function ClienteDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const lenis = useLenis()
  const { data: c, isLoading } = useCliente(id)
  const { cambiarStatus, archivar, eliminar } = useClienteMutations(id)
  const [abrirVenta, setAbrirVenta] = useState(false)

  const irA = (sid) => {
    const el = document.getElementById(sid)
    if (!el) return
    if (lenis) lenis.scrollTo(el, { offset: -72 })
    else el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner size={28} />
      </div>
    )
  }
  if (!c) return <p className="text-ink-3">Cliente no encontrado.</p>

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <button onClick={() => navigate('/crm/clientes')} className="flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft size={16} /> Clientes
      </button>
      <h1 className="font-display text-2xl font-bold text-ink">{c.nombre}</h1>

      <nav className="glass sticky top-2 z-20 flex gap-1 overflow-x-auto rounded-2xl p-1 shadow-glass">
        {SECCIONES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => irA(s.id)}
            className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-surface hover:text-ink"
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="space-y-8 pt-2">
        <Seccion id="datos" titulo="Datos">
          <FichaCliente
            cliente={c}
            puedeEliminar
            onCambiarStatus={(s) => cambiarStatus.mutate({ id, de: c.status, a: s })}
            onArchivar={() => archivar.mutate(id, { onSuccess: () => navigate('/crm/clientes') })}
            onEliminar={() => eliminar.mutate(id, { onSuccess: () => navigate('/crm/clientes') })}
            onRegistrarVenta={() => setAbrirVenta(true)}
          />
        </Seccion>

        <Seccion id="intereses" titulo="Intereses">
          <InteresesCliente clienteId={id} intereses={c.intereses ?? []} />
        </Seccion>

        <Seccion id="autos" titulo="Autos en entrega">
          <AutosEntregaCliente clienteId={id} autos={c.autos_entrega ?? []} />
        </Seccion>

        <Seccion id="seguimiento" titulo="Seguimiento">
          <SeguimientoCliente clienteId={id} />
        </Seccion>

        <Seccion id="tareas" titulo="Tareas">
          <TareasDeCliente clienteId={id} />
        </Seccion>

        <Seccion id="historial" titulo="Historial">
          <HistorialTimeline entidad="cliente" entidadId={id} />
        </Seccion>
      </div>

      <RegistrarVentaModal clienteId={id} open={abrirVenta} onClose={() => setAbrirVenta(false)} />
    </div>
  )
}
