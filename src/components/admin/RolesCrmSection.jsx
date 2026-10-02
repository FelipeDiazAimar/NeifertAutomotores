import Spinner from '@/components/common/Spinner'
import { useRolesCrm, useUsuarioMutations } from '@/crm/hooks/useUsuarios'
import RolRow from '@/crm/components/RolRow'

const ORDEN = ['admin', 'dueno', 'vendedor']

export default function RolesCrmSection() {
  const { data: roles, isLoading } = useRolesCrm()
  const { guardarRol } = useUsuarioMutations()

  const ordenados = [...(roles ?? [])].sort(
    (a, b) => ORDEN.indexOf(a.rol) - ORDEN.indexOf(b.rol),
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-3">
        Vistas por defecto de cada rol. Un usuario con vistas propias no se ve afectado.
      </p>

      {isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner size={28} />
        </div>
      ) : (
        <div className="space-y-2">
          {ordenados.map((r) => (
            <RolRow
              key={r.rol}
              rol={r.rol}
              vistasDefault={r.vistas_default ?? []}
              onGuardar={(rol, vistas_default) => guardarRol.mutate({ rol, vistas_default })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
