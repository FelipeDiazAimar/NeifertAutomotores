import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import Spinner from '@/components/common/Spinner'
import Button from '@/components/common/Button'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import { clienteDeProspecto } from '@/crm/services/clientes.service'

// Una sola resolución por lead aunque el efecto corra dos veces (StrictMode):
// si no, dos llamadas simultáneas podrían crear el cliente duplicado.
const enCurso = new Map()

/** Los leads ya no tienen ficha propia: son clientes. Esta ruta (links viejos,
 *  favoritos) lleva directo al cliente del lead, creándolo si todavía no existe. */
export default function LeadRedirectPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { id: miId, cargando } = useCrmPerfil()
  const [error, setError] = useState(null)

  useEffect(() => {
    if (cargando) return
    let vigente = true
    let p = enCurso.get(id)
    if (!p) {
      p = clienteDeProspecto(id, miId).finally(() => enCurso.delete(id))
      enCurso.set(id, p)
    }
    p.then((clienteId) => {
      if (!vigente) return
      if (clienteId) {
        navigate(`/crm/clientes/${clienteId}`, { replace: true })
      } else {
        toast.error('No encontramos ese lead.')
        navigate('/admin/crm', { replace: true })
      }
    }).catch((e) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [id, miId, cargando, navigate])

  if (error) {
    return (
      <div className="py-20 text-center">
        <p className="text-ink-2">No se pudo abrir el cliente: {error}</p>
        <Link to="/admin/crm" className="mt-4 inline-block">
          <Button variant="glass">Volver a Carga Leads</Button>
        </Link>
      </div>
    )
  }
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <Spinner size={32} />
    </div>
  )
}
