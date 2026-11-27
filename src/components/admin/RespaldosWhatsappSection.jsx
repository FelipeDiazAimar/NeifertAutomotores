import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import GlassCard from '@/components/common/GlassCard'
import Spinner from '@/components/common/Spinner'
import DatePicker from '@/components/common/DatePicker'
import { respaldosWhatsapp } from '@/crm/services/usuarios.service'
import { cn } from '@/lib/cn'

/** Día (yyyy-MM-dd) en hora de Argentina (UTC-3 todo el año) de una fecha ISO. */
export const diaArgentina = (iso) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10)

const hora = (iso) =>
  new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })

const peso = (bytes) => {
  if (!bytes) return null
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const TIPOS = [
  { id: 'todos', label: 'Todos' },
  { id: 'local', label: 'Locales' },
  { id: 'nube', label: 'En la nube' },
]

/** Lo que incluye cada respaldo: la nube guarda solo el texto (los archivos ya viven en R2); el local, según cómo se exportó. */
const contenido = (h) =>
  h.tipo === 'nube' ? 'Solo texto, cifrado' : `${h.conArchivos ? 'Texto y archivos' : 'Solo texto'}${h.cifrado ? ', cifrado' : ' (sin cifrar)'}`

export default function RespaldosWhatsappSection() {
  const { data, isLoading, error } = useQuery({ queryKey: ['respaldos-whatsapp'], queryFn: respaldosWhatsapp })
  const [dia, setDia] = useState('')
  const [tipo, setTipo] = useState('todos')

  const items = useMemo(
    () => (data?.items || []).filter((h) => (!dia || diaArgentina(h.ts) === dia) && (tipo === 'todos' || h.tipo === tipo)),
    [data, dia, tipo]
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-3">
        Respaldos locales (los que se bajan con “Exportar todos los chats”: siempre completos, con todos los archivos, y cifrados) y
        automáticos en la nube (solo el texto, cifrado: las fotos, audios y documentos ya están en R2).
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <DatePicker label="Día" value={dia} onChange={setDia} placeholder="Todos los días" compact />
        </div>
        <div className="flex gap-1" role="group" aria-label="Tipo de respaldo">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTipo(t.id)}
              aria-pressed={tipo === t.id}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                tipo === t.id ? 'border-brand bg-brand/10 text-brand' : 'border-line text-ink-3 hover:text-ink'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {dia && (
          <button type="button" onClick={() => setDia('')} className="text-sm text-ink-3 underline">
            Quitar el día
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-10">
          <Spinner size={24} />
        </div>
      ) : error ? (
        <GlassCard className="p-6 text-sm text-ink-3">No se pudo leer el historial: {error.message}</GlassCard>
      ) : !items.length ? (
        <GlassCard className="p-8 text-center">
          <p className="font-display font-bold text-ink">
            {data?.items?.length ? 'Sin respaldos con ese filtro' : 'Todavía no hay respaldos registrados'}
          </p>
        </GlassCard>
      ) : (
        <ul className="space-y-2">
          {items.map((h, i) => (
            <li key={`${h.tipo}-${h.ts}-${i}`}>
              <GlassCard className="flex flex-wrap items-start gap-x-4 gap-y-1 p-4">
                {h.ok ? (
                  <CheckCircle2 size={18} className="mt-0.5 text-emerald-500" aria-label="Salió bien" />
                ) : (
                  <XCircle size={18} className="mt-0.5 text-red-500" aria-label="Falló" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    {hora(h.ts)} · {h.tipo === 'nube' ? 'En la nube' : 'Local'}
                    {h.usuario ? ` · ${h.usuario}` : ''}
                  </p>
                  <p className="text-sm text-ink-3">
                    {h.ok
                      ? [
                          `${(h.chats || 0).toLocaleString('es-AR')} chats`,
                          `${(h.mensajes || 0).toLocaleString('es-AR')} mensajes`,
                          peso(h.bytes),
                          contenido(h),
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : `Falló: ${h.error || 'sin detalle'}`}
                  </p>
                  {h.sofia && (
                    <p className="text-xs text-ink-3">
                      Charlas de Sofía: {h.sofia.chats} chats · {h.sofia.mensajes} mensajes
                    </p>
                  )}
                  {h.sofiaError && <p className="text-xs text-red-500">Charlas de Sofía no se respaldaron: {h.sofiaError}</p>}
                </div>
              </GlassCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
