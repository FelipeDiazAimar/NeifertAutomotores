import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, Download, Pencil, RotateCcw, Save, Copy, FileImage, FileText } from 'lucide-react'
import { toast } from 'sonner'
import Modal from '@/components/common/Modal'
import Button from '@/components/common/Button'
import PresupuestoVehiculo from './PresupuestoVehiculo'
import {
  PRESUPUESTO_DEFAULTS,
  FINANCIACION_DEFAULT,
  construirDatosPresupuesto,
  guardarPlantilla,
  limpiarPlantillaGuardada,
  nombreArchivoPresupuesto,
  subtituloVehiculo,
  tituloVehiculo,
  formatearPrecio,
  fechaHoyAR,
} from '@/crm/lib/presupuestoTemplate'
import { copiarPresupuestoImagen, exportarPresupuestoPDF, exportarPresupuestoPNG } from '@/crm/lib/presupuestoExport'

const OPCIONES_EXPORT = [
  { value: 'imagen', label: 'Imagen PNG', Icon: FileImage, testid: 'presupuesto-opcion-imagen' },
  { value: 'pdf', label: 'PDF', Icon: FileText, testid: 'presupuesto-opcion-pdf' },
  { value: 'copiar', label: 'Copiar imagen', Icon: Copy, testid: 'presupuesto-opcion-copiar' },
]

const inputCls =
  'glass field-glass w-full rounded-xl px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-neifert/60'

function Campo({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</span>
      {children}
    </label>
  )
}

const BASE_ANCHO = 1080

function useEscalaPreview(contRef, nodoRef) {
  const [escala, setEscala] = useState(1)
  const [alto, setAlto] = useState(undefined)
  useLayoutEffect(() => {
    const cont = contRef.current
    if (!cont) return
    const alMedir = () => {
      const nodo = nodoRef.current
      const s = Math.min(1, cont.clientWidth / BASE_ANCHO)
      setEscala(s)
      if (nodo) setAlto(nodo.offsetHeight * s)
    }
    const ro = new ResizeObserver(alMedir)
    ro.observe(cont)
    const nodo = nodoRef.current
    if (nodo) ro.observe(nodo)
    return () => ro.disconnect()
  }, [contRef, nodoRef])
  return { escala, alto }
}

/** Contenido interno: se monta solo cuando el modal abre → los datos
 *  iniciales (vehículo + plantilla guardada) quedan frescos sin effects. */
function ContenidoPresupuesto({ vehiculo, onClose }) {
  const [datos, setDatos] = useState(() => construirDatosPresupuesto(vehiculo ?? {}))
  const [editando, setEditando] = useState(false)
  const [menuExportar, setMenuExportar] = useState(false)
  const [exportando, setExportando] = useState(false)
  const nodoRef = useRef(null)
  const contRef = useRef(null)
  const menuRef = useRef(null)
  const { escala, alto } = useEscalaPreview(contRef, nodoRef)

  useEffect(() => {
    if (!menuExportar) return
    const alClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuExportar(false)
    }
    const alEscape = (e) => {
      if (e.key === 'Escape') setMenuExportar(false)
    }
    document.addEventListener('mousedown', alClick)
    document.addEventListener('keydown', alEscape)
    return () => {
      document.removeEventListener('mousedown', alClick)
      document.removeEventListener('keydown', alEscape)
    }
  }, [menuExportar])

  const set = (k) => (e) => setDatos((d) => ({ ...d, [k]: e.target.value }))
  const setFin = (i, k) => (e) =>
    setDatos((d) => ({
      ...d,
      financiacion: d.financiacion.map((f, j) => (j === i ? { ...f, [k]: e.target.value } : f)),
    }))

  function restablecer() {
    limpiarPlantillaGuardada()
    setDatos({
      fecha: fechaHoyAR(),
      titulo: tituloVehiculo(vehiculo ?? {}),
      subtitulo: subtituloVehiculo(vehiculo ?? {}),
      precioEntrega: formatearPrecio(vehiculo?.precio_contado),
      patentamientoMonto: '$2.500.000',
      incluye: PRESUPUESTO_DEFAULTS.incluye,
      regalo: PRESUPUESTO_DEFAULTS.regalo,
      condiciones: PRESUPUESTO_DEFAULTS.condiciones,
      patentamientoTexto: PRESUPUESTO_DEFAULTS.patentamientoTexto,
      fechaLimite: PRESUPUESTO_DEFAULTS.fechaLimite,
      financiacion: FINANCIACION_DEFAULT.map((f) => ({ ...f })),
    })
    toast.success('Plantilla restablecida.')
  }

  function guardar() {
    guardarPlantilla(datos)
    setEditando(false)
    toast.success('Plantilla guardada para próximos presupuestos.')
  }

  async function exportar(formato) {
    const nodo = nodoRef.current
    if (!nodo) return
    setMenuExportar(false)
    setExportando(true)
    try {
      if (formato === 'pdf') {
        await exportarPresupuestoPDF(nodo, nombreArchivoPresupuesto(vehiculo ?? {}, datos.fecha, 'pdf'))
        toast.success('PDF descargado.')
      } else if (formato === 'copiar') {
        await copiarPresupuestoImagen(nodo)
        toast.success('Imagen copiada. Pegala en WhatsApp.')
      } else {
        await exportarPresupuestoPNG(nodo, nombreArchivoPresupuesto(vehiculo ?? {}, datos.fecha, 'png'))
        toast.success('Imagen descargada.')
      }
    } catch (e) {
      const msg =
        e?.name === 'NotAllowedError'
          ? 'El navegador bloqueó el portapapeles. Probá descargar la imagen.'
          : (e?.message ?? 'No se pudo exportar.')
      toast.error(msg)
    } finally {
      setExportando(false)
    }
  }

  return (
    <div data-testid="presupuesto-modal" className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button data-testid="presupuesto-editar" variant="glass" icon={Pencil} onClick={() => setEditando((e) => !e)}>
          {editando ? 'Cerrar edición' : 'Editar plantilla'}
        </Button>
        <div ref={menuRef} className="relative">
          <Button
            data-testid="presupuesto-exportar"
            onClick={() => setMenuExportar((v) => !v)}
            disabled={exportando}
            icon={Download}
            iconRight={ChevronDown}
            aria-haspopup="menu"
            aria-expanded={menuExportar}
          >
            {exportando ? 'Generando…' : 'Exportar'}
          </Button>
          {menuExportar && !exportando && (
            <div
              data-testid="presupuesto-menu"
              role="menu"
              className="glass glass-popover absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-2xl p-1.5 shadow-glass"
            >
              {OPCIONES_EXPORT.map(({ value, label, Icon, testid }) => (
                <button
                  key={value}
                  type="button"
                  role="menuitem"
                  data-testid={testid}
                  onClick={() => exportar(value)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink transition-colors hover:bg-surface"
                >
                  <Icon size={16} className="shrink-0 text-ink-3" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {editando && (
        <div className="glass space-y-3 rounded-2xl p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Fecha">
              <input className={inputCls} value={datos.fecha} onChange={set('fecha')} />
            </Campo>
            <Campo label="Patentamiento aprox.">
              <input className={inputCls} value={datos.patentamientoMonto} onChange={set('patentamientoMonto')} />
            </Campo>
          </div>
          <Campo label="Título (vehículo)">
            <input className={inputCls} value={datos.titulo} onChange={set('titulo')} />
          </Campo>
          <Campo label="Subtítulo (km | color)">
            <input className={inputCls} value={datos.subtitulo} onChange={set('subtitulo')} />
          </Campo>
          <Campo label="Precio entrega">
            <input className={inputCls} value={datos.precioEntrega} onChange={set('precioEntrega')} />
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Incluye">
              <input className={inputCls} value={datos.incluye} onChange={set('incluye')} />
            </Campo>
            <Campo label="Regalo">
              <input className={inputCls} value={datos.regalo} onChange={set('regalo')} />
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
                  onChange={setFin(i, 'entrega')}
                />
                <input
                  aria-label={`Cuotas opción ${i + 1}`}
                  className={inputCls}
                  value={f.cuotas}
                  onChange={setFin(i, 'cuotas')}
                />
              </div>
            ))}
          </div>
          <Campo label="Condiciones">
            <textarea className={`${inputCls} min-h-[84px]`} value={datos.condiciones} onChange={set('condiciones')} />
          </Campo>
          <Campo label="Patentamiento (texto)">
            <textarea
              className={`${inputCls} min-h-[84px]`}
              value={datos.patentamientoTexto}
              onChange={set('patentamientoTexto')}
            />
          </Campo>
          <Campo label="Fecha límite (texto)">
            <textarea
              className={`${inputCls} min-h-[84px]`}
              value={datos.fechaLimite}
              onChange={set('fechaLimite')}
            />
          </Campo>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={restablecer}>
              Restablecer
            </Button>
            <Button size="sm" icon={Save} onClick={guardar}>
              Guardar plantilla
            </Button>
          </div>
        </div>
      )}

      <div ref={contRef} className="grid place-items-center overflow-hidden rounded-2xl bg-black/70 p-3">
        <div style={{ width: BASE_ANCHO * escala, height: alto, overflow: 'hidden' }}>
          <div style={{ transform: `scale(${escala})`, transformOrigin: 'top left', width: BASE_ANCHO }}>
            <PresupuestoVehiculo datos={datos} nodoRef={nodoRef} />
          </div>
        </div>
      </div>
      <p className="text-xs text-ink-3">
        La vista previa es la imagen final en alta resolución. Los cambios de la plantilla se guardan en este
        dispositivo para próximos presupuestos.
      </p>
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  )
}

export default function PresupuestoModal({ open, onClose, vehiculo }) {
  return (
    <Modal open={open} onClose={onClose} title="Presupuesto del vehículo" size="xl">
      {open && <ContenidoPresupuesto vehiculo={vehiculo} onClose={onClose} />}
    </Modal>
  )
}
