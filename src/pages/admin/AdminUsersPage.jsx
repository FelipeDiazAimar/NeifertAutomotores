import { useState } from 'react'
import { motion } from 'framer-motion'
import { UserPlus, Mail, Shield, ShieldCheck, Trash2, KeyRound, Info } from 'lucide-react'
import { toast } from 'sonner'
import GlassCard from '@/components/common/GlassCard'
import Button from '@/components/common/Button'
import Badge from '@/components/common/Badge'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/cn'
import { fadeUp, staggerContainer } from '@/lib/animations'

const ROLE_LABEL = { gerente: 'Gerente', vendedor: 'Vendedor' }
const ROLE_ICON = { gerente: ShieldCheck, vendedor: Shield }

// Usuarios de demostración. Con Supabase real se consulta la tabla `profiles`.
const DEMO_USERS = [
  {
    id: 'u1',
    full_name: 'Marcos Neifert',
    email: 'marcos@neifertautomotores.com',
    role: 'gerente',
    created_at: '2024-01-15',
    avatar_url: null,
  },
  {
    id: 'u2',
    full_name: 'Ana García',
    email: 'ana@neifertautomotores.com',
    role: 'vendedor',
    created_at: '2024-03-20',
    avatar_url: null,
  },
  {
    id: 'u3',
    full_name: 'Carlos Ibáñez',
    email: 'carlos@neifertautomotores.com',
    role: 'vendedor',
    created_at: '2024-06-01',
    avatar_url: null,
  },
]

function Avatar({ user, size = 40 }) {
  const initials = (user.full_name || user.email || '?')
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

function InviteModal({ onClose }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('vendedor')

  const send = (e) => {
    e.preventDefault()
    toast.info('Modo demo: la invitación no se envía. Conectá Supabase Auth para habilitar esta función.')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="glass relative z-10 w-full max-w-sm rounded-[20px] p-6 shadow-glass"
      >
        <h3 className="mb-4 font-display text-lg font-bold text-ink">Invitar usuario</h3>
        <form onSubmit={send} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-2">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.com"
              className="glass w-full rounded-xl px-4 py-2.5 text-sm text-ink outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-neifert/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-2">Rol</label>
            <div className="flex gap-2">
              {['gerente', 'vendedor'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    'flex-1 rounded-xl border py-2 text-sm font-medium transition-colors',
                    role === r
                      ? 'border-neifert bg-neifert/10 text-neifert'
                      : 'border-line text-ink-2 hover:border-neifert/40'
                  )}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-line py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-neifert/40"
            >
              Cancelar
            </button>
            <Button type="submit" icon={Mail} className="flex-1">
              Enviar invitación
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

export default function AdminUsersPage() {
  const { profile } = useAuth()
  const [showInvite, setShowInvite] = useState(false)

  const onDelete = (u) => {
    toast.info('Modo demo: no se pueden eliminar usuarios. Conectá Supabase Auth.')
  }

  const onResetPassword = (u) => {
    toast.info('Modo demo: el reseteo de contraseña requiere Supabase Auth configurado.')
  }

  return (
    <section>
      <motion.div
        variants={staggerContainer(0.06)}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={fadeUp} className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-neifert">Administración</p>
            <h1 className="mt-1 font-display text-3xl font-extrabold text-ink">Usuarios</h1>
            <p className="mt-1 text-sm text-ink-3">Gestioná quién tiene acceso al panel admin</p>
          </div>
          <Button icon={UserPlus} onClick={() => setShowInvite(true)}>
            Invitar usuario
          </Button>
        </motion.div>

        {/* Banner modo demo */}
        <motion.div variants={fadeUp}>
          <GlassCard className="mb-6 flex items-start gap-3 p-4">
            <Info size={18} className="mt-0.5 shrink-0 text-neifert" />
            <div className="text-sm text-ink-2">
              <span className="font-semibold text-ink">Modo demo activo.</span> Los usuarios mostrados son de muestra. Para gestionar accesos reales conectá{' '}
              <span className="font-semibold">Supabase Auth</span> con las variables de entorno.
            </div>
          </GlassCard>
        </motion.div>

        {/* Lista de usuarios */}
        <motion.div variants={fadeUp} className="space-y-3">
          {DEMO_USERS.map((u) => {
            const RoleIcon = ROLE_ICON[u.role] || Shield
            const isCurrentUser = profile?.email === u.email
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
                  <p className="text-sm text-ink-3">{u.email}</p>
                  <p className="mt-0.5 text-xs text-ink-3">
                    Desde {new Date(u.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
                    u.role === 'gerente'
                      ? 'bg-neifert/10 text-neifert'
                      : 'bg-surface text-ink-2'
                  )}>
                    <RoleIcon size={12} /> {ROLE_LABEL[u.role]}
                  </span>
                  <button
                    onClick={() => onResetPassword(u)}
                    title="Resetear contraseña"
                    className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface hover:text-ink"
                  >
                    <KeyRound size={15} />
                  </button>
                  {!isCurrentUser && (
                    <button
                      onClick={() => onDelete(u)}
                      title="Eliminar usuario"
                      className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface hover:text-neifert"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </GlassCard>
            )
          })}
        </motion.div>

        {/* Resumen de roles */}
        <motion.div variants={fadeUp} className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { label: 'Usuarios totales', value: DEMO_USERS.length, color: 'text-ink' },
            { label: 'Gerentes', value: DEMO_USERS.filter((u) => u.role === 'gerente').length, color: 'text-neifert' },
            { label: 'Vendedores', value: DEMO_USERS.filter((u) => u.role === 'vendedor').length, color: 'text-ink-2' },
          ].map(({ label, value, color }) => (
            <GlassCard key={label} className="p-4 text-center">
              <p className={cn('text-3xl font-extrabold font-display', color)}>{value}</p>
              <p className="mt-1 text-xs text-ink-3">{label}</p>
            </GlassCard>
          ))}
        </motion.div>
      </motion.div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </section>
  )
}
