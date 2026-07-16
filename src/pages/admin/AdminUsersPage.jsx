import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Shield, ShieldCheck, Trash2, Info, IdCard } from 'lucide-react'
import { toast } from 'sonner'
import GlassCard from '@/components/common/GlassCard'
import Spinner from '@/components/common/Spinner'
import { useAuth } from '@/hooks/useAuth'
import { fetchUsers, deleteUser } from '@/services/users.service'
import { cn } from '@/lib/cn'
import { fadeUp, staggerContainer } from '@/lib/animations'

const ROLE_LABEL = { admin: 'Admin', vendedor: 'Vendedor' }
const ROLE_ICON = { admin: ShieldCheck, vendedor: Shield }

function Avatar({ user, size = 40 }) {
  const initials = (user.full_name || user.crm_user || '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return user.avatar_url ? (
    <img
      src={user.avatar_url}
      alt=""
      style={{ width: size, height: size }}
      className="rounded-full object-cover"
    />
  ) : (
    <span
      style={{ width: size, height: size }}
      className="grid place-items-center rounded-full bg-neifert/15 text-sm font-bold text-neifert"
    >
      {initials}
    </span>
  )
}

export default function AdminUsersPage() {
  const { session, isDemo } = useAuth()
  const queryClient = useQueryClient()

  const { data: users = [], isLoading } = useQuery({ queryKey: ['perfiles'], queryFn: fetchUsers })

  const removeMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      toast.success('Usuario eliminado')
      queryClient.invalidateQueries({ queryKey: ['perfiles'] })
    },
    onError: (e) => toast.error('No se pudo eliminar: ' + e.message),
  })

  const onDelete = (u) => {
    if (!confirm(`¿Eliminar el acceso de ${u.full_name}? Si vuelve a entrar con credenciales válidas del CRM, se le crea de nuevo.`)) return
    removeMutation.mutate(u.id)
  }

  return (
    <section>
      <motion.div variants={staggerContainer(0.06)} initial="hidden" animate="show">
        <motion.div variants={fadeUp} className="mb-6">
          <p className="text-xs font-bold uppercase tracking-wider text-neifert">Administración</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold text-ink">Usuarios</h1>
          <p className="mt-1 text-sm text-ink-3">Quién tiene acceso al panel admin</p>
        </motion.div>

        {isDemo && (
          <motion.div variants={fadeUp}>
            <GlassCard className="mb-6 flex items-start gap-3 p-4">
              <Info size={18} className="mt-0.5 shrink-0 text-neifert" />
              <div className="text-sm text-ink-2">
                <span className="font-semibold text-ink">Modo demo activo.</span> Los usuarios
                mostrados son de muestra. Conectá Supabase (.env) para ver los reales.
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Cómo se suma alguien: no hay invitación, el CRM viejo es la única
         *  fuente de identidad — el perfil se crea solo en el primer login. */}
        <motion.div variants={fadeUp}>
          <GlassCard className="mb-6 flex items-start gap-3 p-4">
            <IdCard size={18} className="mt-0.5 shrink-0 text-neifert" />
            <div className="text-sm text-ink-2">
              <span className="font-semibold text-ink">¿Cómo se suma un usuario nuevo?</span> No
              hay que invitarlo desde acá: el ingreso al panel se hace con el usuario y contraseña
              del CRM viejo (neifertcrm.com). En cuanto esa persona inicia sesión por primera vez
              con credenciales válidas, aparece automáticamente en esta lista.
            </div>
          </GlassCard>
        </motion.div>

        {isLoading ? (
          <div className="grid place-items-center py-16">
            <Spinner size={28} />
          </div>
        ) : (
          <motion.div variants={fadeUp} className="space-y-3">
            {users.map((u) => {
              const RoleIcon = ROLE_ICON[u.role] || Shield
              const isCurrentUser = session?.user?.id === u.id
              return (
                <GlassCard key={u.id} className="flex items-center gap-4 p-4">
                  <Avatar user={u} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-ink">{u.full_name}</p>
                      {isCurrentUser && (
                        <span className="rounded-full bg-neifert/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neifert">
                          Tú
                        </span>
                      )}
                    </div>
                    {u.crm_user && <p className="text-sm text-ink-3">Usuario CRM: {u.crm_user}</p>}
                    {u.created_at && (
                      <p className="mt-0.5 text-xs text-ink-3">
                        Desde{' '}
                        {new Date(u.created_at).toLocaleDateString('es-AR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      title="El rol lo define el CRM viejo en cada login"
                      className={cn(
                        'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
                        u.role === 'admin' ? 'bg-neifert/10 text-neifert' : 'bg-surface text-ink-2'
                      )}
                    >
                      <RoleIcon size={12} /> {ROLE_LABEL[u.role] || u.role || 'Sin rol'}
                    </span>
                    {!isCurrentUser && (
                      <button
                        onClick={() => onDelete(u)}
                        disabled={removeMutation.isPending}
                        title="Eliminar acceso"
                        className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface hover:text-neifert disabled:opacity-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </GlassCard>
              )
            })}
            {users.length === 0 && (
              <p className="py-10 text-center text-sm text-ink-3">
                Todavía nadie inició sesión en el panel.
              </p>
            )}
          </motion.div>
        )}

        {/* Resumen de roles */}
        <motion.div variants={fadeUp} className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { label: 'Usuarios totales', value: users.length, color: 'text-ink' },
            {
              label: 'Admins',
              value: users.filter((u) => u.role === 'admin').length,
              color: 'text-neifert',
            },
            {
              label: 'Vendedores',
              value: users.filter((u) => u.role === 'vendedor').length,
              color: 'text-ink-2',
            },
          ].map(({ label, value, color }) => (
            <GlassCard key={label} className="p-4 text-center">
              <p className={cn('text-3xl font-extrabold font-display', color)}>{value}</p>
              <p className="mt-1 text-xs text-ink-3">{label}</p>
            </GlassCard>
          ))}
        </motion.div>
      </motion.div>
    </section>
  )
}
