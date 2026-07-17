import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Trash2, ArrowDownToLine, Search } from 'lucide-react'
import { subscribeLogs, getLogs, clearLogs, logsAsText } from '@/lib/logCapture'
import { cn } from '@/lib/cn'

const LEVEL_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'error', label: 'Errores' },
  { id: 'warn', label: 'Warnings' },
  { id: 'log', label: 'Logs' },
]

const LEVEL_STYLE = {
  error: 'text-red-500',
  warn: 'text-amber-500',
  info: 'text-sky-500',
  log: 'text-ink-2',
}

const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export default function AdminLogErrorsPage() {
  const [logs, setLogs] = useState(getLogs())
  const [level, setLevel] = useState('all')
  const [query, setQuery] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef(null)

  useEffect(() => subscribeLogs((next) => setLogs([...next])), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return logs.filter((e) => {
      if (level === 'error' && e.level !== 'error') return false
      if (level === 'warn' && e.level !== 'warn') return false
      if (level === 'log' && e.level !== 'log' && e.level !== 'info') return false
      if (q && !e.message.toLowerCase().includes(q) && !(e.path || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [logs, level, query])

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [filtered.length, autoScroll])

  const counts = useMemo(
    () => ({
      error: logs.filter((e) => e.level === 'error').length,
      warn: logs.filter((e) => e.level === 'warn').length,
    }),
    [logs]
  )

  const copyAll = async () => {
    const text = logsAsText()
    if (!text) return toast.info('No hay logs para copiar.')
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Logs copiados al portapapeles')
    } catch {
      // Fallback para navegadores sin permiso de clipboard.
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        toast.success('Logs copiados')
      } catch {
        toast.error('No se pudo copiar. Seleccioná el texto a mano.')
      }
      document.body.removeChild(ta)
    }
  }

  const onClear = () => {
    if (!confirm('¿Borrar todos los logs guardados?')) return
    clearLogs()
    toast.success('Logs borrados')
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink md:text-3xl">Logs y errores</h1>
          <p className="mt-1 text-sm text-ink-2">
            Registro de la consola y errores no atrapados, guardado en este dispositivo. Útil para
            depurar la carga de imágenes desde el teléfono. Filtrá por <code>[IMG]</code> para seguir la subida.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyAll}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink transition-colors hover:border-neifert hover:text-neifert"
          >
            <Copy size={15} /> Copiar
          </button>
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink transition-colors hover:border-neifert hover:text-neifert"
          >
            <Trash2 size={15} /> Limpiar
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar… (ej: [IMG], R2, Load failed)"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-sm text-ink outline-none focus:border-neifert"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-line p-1">
          {LEVEL_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setLevel(f.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                level === f.id ? 'bg-neifert text-white' : 'text-ink-2 hover:text-ink'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Resumen */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
        <span>{filtered.length} mostrados / {logs.length} totales</span>
        <span className="text-red-500">{counts.error} errores</span>
        <span className="text-amber-500">{counts.warn} warnings</span>
        <button
          onClick={() => setAutoScroll((v) => !v)}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 transition-colors',
            autoScroll ? 'text-neifert' : 'text-ink-3 hover:text-ink'
          )}
        >
          <ArrowDownToLine size={13} /> Auto-scroll {autoScroll ? 'on' : 'off'}
        </button>
      </div>

      {/* Lista */}
      <div className="mt-4 max-h-[65vh] overflow-y-auto rounded-2xl border border-line bg-surface-solid">
        {filtered.length === 0 ? (
          <div className="grid min-h-[160px] place-items-center px-4 text-center text-sm text-ink-3">
            {logs.length === 0
              ? 'Todavía no hay logs. Reproducí la acción (ej: subir una foto) y volvé a esta pantalla.'
              : 'Ningún log coincide con el filtro.'}
          </div>
        ) : (
          <ul className="divide-y divide-line/60 font-mono text-[12px] leading-relaxed">
            {filtered.map((e, i) => (
              <li key={i} className="flex flex-wrap gap-2 px-3 py-2">
                <span className="shrink-0 tabular-nums text-ink-3">{fmtTime(e.ts)}</span>
                <span className={cn('shrink-0 font-bold uppercase', LEVEL_STYLE[e.level] || 'text-ink-2')}>
                  {e.level}
                </span>
                {e.path && <span className="shrink-0 text-ink-3">{e.path}</span>}
                <span className={cn('w-full whitespace-pre-wrap break-words sm:w-auto sm:flex-1', LEVEL_STYLE[e.level] || 'text-ink')}>
                  {e.message}
                </span>
              </li>
            ))}
            <li ref={bottomRef} />
          </ul>
        )}
      </div>
    </section>
  )
}
