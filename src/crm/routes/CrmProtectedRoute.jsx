import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import Spinner from '@/components/common/Spinner'

export default function CrmProtectedRoute() {
  const { session, loading } = useAuth()
  const { activo, cargando } = useCrmPerfil()
  const location = useLocation()

  if (loading || cargando) {
    return (
      <div className="crm-root grid min-h-screen place-items-center">
        <Spinner size={32} />
      </div>
    )
  }

  if (!session?.user) {
    return <Navigate to="/crm/login" replace state={{ from: location }} />
  }

  if (!activo) {
    return (
      <div className="crm-root grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-semibold">Tu cuenta no tiene acceso al CRM.</p>
          <p className="mt-1 text-[var(--crm-muted)]">
            Pedile a un administrador que te habilite.
          </p>
        </div>
      </div>
    )
  }

  return <Outlet />
}
