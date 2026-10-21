import { RotateCcw, Save } from 'lucide-react'
import Button from '@/components/common/Button'

export const inputCls =
  'glass field-glass w-full rounded-xl px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-neifert/60'

export function Campo({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</span>
      {children}
    </label>
  )
}

/** Formulario de la plantilla de presupuesto.
 *  `mostrarVehiculo`: incluye fecha/título/subtítulo/precio/patentamiento-monto
 *  (datos del presupuesto individual, no se comparten).
 *  Sin `puedeEditar`, los campos de plantilla van deshabilitados y se ocultan
 *  Guardar/Restablecer. */
export default function PresupuestoEditor({
  datos,
  onDato,
  onFin,
  onGuardar,
  guardando = false,
  onRestablecer,
  puedeEditar = true,
  mostrarVehiculo = true,
}) {
  return (
    <div className="glass space-y-3 rounded-2xl p-4">
      {mostrarVehiculo && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Fecha">
              <input className={inputCls} value={datos.fecha} onChange={(e) => onDato('fecha', e.target.value)} />
            </Campo>
            <Campo label="Patentamiento aprox.">
              <input
                className={inputCls}
                value={datos.patentamientoMonto}
                onChange={(e) => onDato('patentamientoMonto', e.target.value)}
              />
            </Campo>
          </div>
          <Campo label="Título (vehículo)">
            <input className={inputCls} value={datos.titulo} onChange={(e) => onDato('titulo', e.target.value)} />
          </Campo>
          <Campo label="Subtítulo (km | color)">
            <input className={inputCls} value={datos.subtitulo} onChange={(e) => onDato('subtitulo', e.target.value)} />
          </Campo>
          <Campo label="Precio entrega">
            <input
              className={inputCls}
              value={datos.precioEntrega}
              onChange={(e) => onDato('precioEntrega', e.target.value)}
            />
          </Campo>
        </>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Incluye">
          <input
            className={inputCls}
            value={datos.incluye}
            disabled={!puedeEditar}
            onChange={(e) => onDato('incluye', e.target.value)}
          />
        </Campo>
        <Campo label="Regalo">
          <input
            className={inputCls}
            value={datos.regalo}
            disabled={!puedeEditar}
            onChange={(e) => onDato('regalo', e.target.value)}
          />
        </Campo>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {datos.financiacion.map((f, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-line p-3">
            <p className="text-xs font-bold text-ink-3">Opción {String(i + 1).padStart(2, '0')}</p>
            <input
              aria-label={`Entrega opción ${i + 1}`}
              className={inputCls}
              value={f.entrega}
              disabled={!puedeEditar}
              onChange={(e) => onFin(i, 'entrega', e.target.value)}
            />
            <input
              aria-label={`Cuotas opción ${i + 1}`}
              className={inputCls}
              value={f.cuotas}
              disabled={!puedeEditar}
              onChange={(e) => onFin(i, 'cuotas', e.target.value)}
            />
          </div>
        ))}
      </div>
      <Campo label="Condiciones">
        <textarea
          className={`${inputCls} min-h-[84px]`}
          value={datos.condiciones}
          disabled={!puedeEditar}
          onChange={(e) => onDato('condiciones', e.target.value)}
        />
      </Campo>
      <Campo label="Patentamiento (texto)">
        <textarea
          className={`${inputCls} min-h-[84px]`}
          value={datos.patentamientoTexto}
          disabled={!puedeEditar}
          onChange={(e) => onDato('patentamientoTexto', e.target.value)}
        />
      </Campo>
      <Campo label="Fecha límite (texto)">
        <textarea
          className={`${inputCls} min-h-[84px]`}
          value={datos.fechaLimite}
          disabled={!puedeEditar}
          onChange={(e) => onDato('fechaLimite', e.target.value)}
        />
      </Campo>
      {puedeEditar && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={onRestablecer}>
            Restablecer
          </Button>
          <Button size="sm" icon={Save} onClick={onGuardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar plantilla'}
          </Button>
        </div>
      )}
    </div>
  )
}
