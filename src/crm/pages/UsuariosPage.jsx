import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import Button from '@/components/common/Button'
import Spinner from '@/components/common/Spinner'
import GlassCard from '@/components/common/GlassCard'
import { useUsuarios, useRolesCrm, useUsuarioMutations } from '@/crm/hooks/useUsuarios'
import UsuarioRow from '@/crm/components/UsuarioRow'
import UsuarioFormModal from '@/crm/components/UsuarioFormModal'
import ResetPasswordModal from '@/crm/components/ResetPasswordModal'

export default function UsuariosPage() {
  const { data: usuarios, isLoading } = useUsuarios()
  const { data: roles = [] } = useRolesCrm()
  const { actualizarUsuario } = useUsuarioMutations()
  const [nuevo, setNuevo] = useState(false)
  const [reset, setReset] = useState(null)

  const rolesMap = useMemo(() => Object.fromEntries(roles.map((r) => [r.rol, r])), [roles])
  const onCambiar = (id, parche) => actualizarUsuario.mutate({ id, ...parche })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Usuarios</h1>
          <p className="text-sm text-ink-3">Roles y acceso a cada sección del CRM.</p>
        </div>
        <Button icon={Plus} onClick={() => setNuevo(true)}>
          Nuevo usuario
        </Button>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner size={28} />
        </div>
      ) : !usuarios?.length ? (
        <GlassCard className="p-10 text-center">
          <p className="font-display font-bold text-ink">Todavía no hay usuarios</p>
          <p className="mt-1 text-sm text-ink-3">Creá el primero para que pueda ingresar al CRM.</p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {usuarios.map((u) => (
            <UsuarioRow
              key={u.id}
              usuario={u}
              rolesMap={rolesMap}
              onCambiar={onCambiar}
              onResetPassword={setReset}
            />
          ))}
        </div>
      )}

      <UsuarioFormModal open={nuevo} onClose={() => setNuevo(false)} />
      <ResetPasswordModal open={Boolean(reset)} usuario={reset} onClose={() => setReset(null)} />
    </div>
  )
}
