import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import Button from '@/components/common/Button'
import GlassCard from '@/components/common/GlassCard'
import Spinner from '@/components/common/Spinner'
import { useMisVistas } from '@/crm/hooks/useMisVistas'
import { vistaDeRuta, primeraRutaPermitida } from '@/crm/lib/vistas'

/** Bloquea las rutas cuya vista no esté habilitada para el usuario. Las rutas
 *  sin vista asociada (cambiar-password, etc.) pasan siempre. */
export default function VistaGuard() {
  const location = useLocation()
  const navigate = useNavigate()
  const vista = vistaDeRuta(location.pathname)
  const { vistas, cargando } = useMisVistas()

  if (vista === null) return <Outlet />

  if (cargando) {
    return (
      <div className="grid place-items-center py-20">
        <Spinner size={28} />
      </div>
    )
  }

  if (!vistas.includes(vista)) {
    const volverA = primeraRutaPermitida(vistas) ?? '/crm/cambiar-password'
    return (
      <div className="grid place-items-center py-16">
        <GlassCard className="max-w-sm p-10 text-center">
          <Lock size={28} className="mx-auto text-ink-3" />
          <p className="mt-3 font-display text-lg font-bold text-ink">No tenés acceso a esta sección</p>
          <p className="mt-1 text-sm text-ink-3">
            Pedile a un administrador que te habilite esta vista.
          </p>
          <Button className="mt-4" onClick={() => navigate(volverA)}>
            Volver
          </Button>
        </GlassCard>
      </div>
    )
  }

  return <Outlet />
}
