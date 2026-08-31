import { ChevronDown, RotateCcw, KeyRound } from 'lucide-react'
import Badge from '@/components/common/Badge'
import Button from '@/components/common/Button'
import Select from '@/components/common/Select'
import { cn } from '@/lib/cn'
import { ROL_LABEL, vistasEfectivas } from '@/crm/lib/vistas'
import VistasChecklist from './VistasChecklist'

const ROL_OPCIONES = Object.entries(ROL_LABEL).map(([id, label]) => ({ id, label }))

/** Acordeón de un usuario del CRM. `onCambiar(id, parche)` guarda al toque;
 *  `onResetPassword(usuario)` abre el modal de contraseña. */
export default function UsuarioRow({ usuario: u, rolesMap, onCambiar, onResetPassword }) {
  const tieneOverride = Array.isArray(u.vistas_override)
  const vistas = vistasEfectivas(u, rolesMap)

  return (
    <details className="glass group rounded-2xl">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{u.nombre}</p>
          <p className="truncate text-xs text-ink-3">@{u.usuario}</p>
        </div>
        <Badge variant="neutral">{ROL_LABEL[u.rol] ?? u.rol}</Badge>
        <Badge variant={u.activo ? 'green' : 'neutral'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge>
        <ChevronDown size={18} className="shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
      </summary>

      <div className="space-y-4 border-t border-line p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-44">
            <Select
              label="Rol"
              size="sm"
              value={u.rol}
              options={ROL_OPCIONES}
              onChange={(rol) => onCambiar(u.id, { rol })}
            />
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={u.activo}
            aria-label="Activo"
            onClick={() => onCambiar(u.id, { activo: !u.activo })}
            className={cn(
              'relative h-7 w-12 shrink-0 rounded-full transition-colors',
              u.activo ? 'bg-success' : 'bg-ink/20',
            )}
          >
            <span
              className={cn(
                'absolute top-1 h-5 w-5 rounded-full bg-white transition-transform',
                u.activo ? 'translate-x-6' : 'translate-x-1',
              )}
            />
          </button>
          <span className="text-xs text-ink-3">{u.activo ? 'Puede ingresar' : 'Sin acceso'}</span>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">Vistas</span>
            {tieneOverride ? (
              <Button size="sm" variant="ghost" onClick={() => onCambiar(u.id, { vistas_override: null })}>
                <RotateCcw size={13} /> Restablecer a las del rol
              </Button>
            ) : (
              <span className="text-xs text-ink-3">Usando las vistas del rol</span>
            )}
          </div>
          <VistasChecklist
            value={vistas}
            onChange={(v) => onCambiar(u.id, { vistas_override: v })}
          />
        </div>

        <div className="flex justify-end">
          <Button size="sm" variant="glass" onClick={() => onResetPassword(u)}>
            <KeyRound size={13} /> Resetear contraseña
          </Button>
        </div>
      </div>
    </details>
  )
}
